const express = require("express");
const session = require("express-session");
const app = express();
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const port = 3000;

let db = new sqlite3.Database("codingo.db", (err) => {
    if (err) throw err;
    console.log("Connected to the codingo database");
});

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "codingo_secret",
    resave: false,
    saveUninitialized: false,
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
    res.redirect("/home")
});

app.get("/home", (req, res) => {
    res.render("home");
});

app.get("/signin", (req, res) => {
    if (req.session.user) {
        return res.redirect("/home");
    }
    res.render("signin", { error: null });
});

app.post("/signin", (req, res) => {
    let { identifier, password } = req.body;
    let sql1 = `SELECT *
                FROM Account
                WHERE (email = ? OR username = ?) AND password = ?`;
    db.get(sql1, [identifier, identifier, password], (_, user) => {
        if (!user) {
            return res.render("signin", { error: "อีเมล ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }
        req.session.user = user;
        res.redirect("/home");
    });
});

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

app.post("/register", (req, res) => {
    let { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.render("register", { error: "กรุณากรอกข้อมูลให้ครบ" });
    }
    let sql1 = `SELECT *
                FROM Account
                WHERE email = ? OR username = ?`;
    db.get(sql1, [email, username], (_, existing) => {
        if (existing) {
            return res.render("register", { error: "ชื่อผู้ใช้หรืออีเมลนี้มีในระบบแล้ว" });
        }
        let sql2 = `INSERT INTO Account (username, email, password) VALUES
                    (?, ?, ?)`;
        db.run(sql2, [username, email, password], (err) => {
            if (err) {
                return res.render("register", { error: "เกิดข้อผิดพลาด" });
            }
            let newAccountId = this.lastID;
            let sql3 = `INSERT INTO Gamificate (account_id, xp, last_active, level, streak) VALUES
                        (?, 0, DATE('now'), 0, 0)`;
            db.run(sql3, [newAccountId], (_) => {
                let sql4 = `SELECT * FROM Account WHERE account_id = ?`;
                db.get(sql4, [newAccountId], (_, user) => {
                    req.session.user = user;
                    res.redirect("/home");
                });
            });
        });
    });
});

app.get("/signout", (req, res) => {
    req.session.destroy();
    res.redirect("/home");
});

app.get("/course", (req, res) => {
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id`;
    db.all(sql1, (_, courses) => {
        res.render("course", { courses: courses || [], search: "" });
    });
});

app.post("/course", (req, res) => {
    let search = req.body.search || "";
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id
                WHERE Course.title LIKE ? OR Catagory.catagory_name LIKE ?`;
    db.all(sql1, [`%${search}%`, `%${search}%`], (_, courses) => {
        res.render("course", { courses: courses || [], search });
    });
});

app.get("/course/:courseId", (req, res) => {
    let courseId = req.params.courseId;
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id
                WHERE Course.course_id = ?`
    db.get(sql1, [courseId], (_, course) => {
        if (!course) {
            return res.redirect("/course");
        }
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id = ?`;
        db.all(sql2, [courseId], (_, contents) => {
            let inLibrary = false;
            if (req.session.user) {
                let sql3 = `SELECT *
                            FROM Library
                            WHERE account_id = ? AND course_id = ?`;
                db.get(sql3, [req.session.user.account_id, courseId], (_, lib) => {
                    inLibrary = !!lib;
                    if (inLibrary) {
                        res.redirect(`/library/${courseId}`);
                    }
                    else {
                        res.render("content", { course, contents: contents || [], inLibrary, activeContent: null, result: null, completedIds: [] });
                    }
                });
            }
            else {
                res.render("content", { course, contents: contents || [], inLibrary, activeContent: null, result: null, completedIds: [] });
            }
        });
    });
});

app.post("/course/add/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let courseId = req.params.courseId;
    let sql1 = `SELECT *
                FROM Library
                WHERE account_id = ? AND course_id = ?`;
    db.get(sql1, [req.session.user.account_id, courseId], (_, existing) => {
        if (!existing) {
            let sql2 = `INSERT INTO Library (account_id, course_id) VALUES
                        (?, ?)`;
            db.run(sql2, [req.session.user.account_id, courseId], (_) => {
                res.redirect(`/library/${courseId}`);
            });
        }
    });
});

app.get("/library", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color,
                (SELECT COUNT(*) FROM Content WHERE Content.course_id = Course.course_id) as total,
                (SELECT COUNT(*) FROM Progression WHERE Progression.course_id = Course.course_id AND Progression.account_id = ? AND Progression.completed = 1) as done
                FROM Library
                JOIN Course
                ON Library.course_id = Course.course_id
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id
                WHERE Library.account_id = ?`
    db.all(sql1, [req.session.user.account_id, req.session.user.account_id], (_, courses) => {
        res.render("library", { courses: courses || [] });
    });
});

app.get("/library/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let courseId = req.params.courseId;
    let contentId = req.query.content;
    let sql1 = `SELECT * FROM Library WHERE account_id = ? AND course_id = ?`;
    db.get(sql1, [req.session.user.account_id, courseId], (_, lib) => {
        if (!lib) {
            return res.redirect(`/course/${courseId}`);
        }
        let sql2 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                    FROM Course JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                    WHERE Course.course_id = ?`
        db.get(sql2, [courseId], (_, course) => {
            let sql3 = `SELECT *
                    FROM Content
                    WHERE course_id = ?`;
            db.all(sql3, [courseId], (_, contents) => {
                let sql4 = `SELECT content_id
                        FROM Progression
                        WHERE account_id = ? AND course_id = ? AND completed = 1`;
                db.all(sql4, [req.session.user.account_id, courseId], (_, progRows) => {
                    const completedIds = (progRows || []).map(r => r.content_id);
                    let activeContent = null;
                    if (contentId) {
                        activeContent = contents.find(c => c.content_id == contentId) || null;
                    }
                    res.render("content", { course, contents: contents || [], inLibrary: true, activeContent, result: null, completedIds
                    });
                });
            });
        });
    });
});

app.post("/library/remove/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let sql1 = `DELETE FROM Library
                WHERE account_id = ?
                AND course_id = ?`;
    db.run(sql1, [req.session.user.account_id, req.params.courseId], () => {
        res.redirect("/library");
    });
});

app.post("/library/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let { courseId, contentId } = req.params;
    let { answer } = req.body;
    let sql1 = `SELECT *
                FROM Content
                WHERE content_id = ?`;
    db.get(sql1, [contentId], (_, content) => {
        let correct = content && answer == content.Answer;
        let sql2 = `SELECT *
                    FROM Progression
                    WHERE account_id = ? AND course_id = ? AND content_id = ?`;
        db.get(sql2, [req.session.user.account_id, courseId, contentId], (_, existing) => {
            const finish = () => {
                let sql3 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                            FROM Course JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                            WHERE Course.course_id = ?`;
                db.get(sql3, [courseId], (_, course) => {
                    let sql4 = `SELECT *
                                FROM Content
                                WHERE course_id = ?`;
                    db.all(sql4, [courseId], (_, contents) => {
                        let sql5 = `SELECT content_id
                                    FROM Progression
                                    WHERE account_id = ? AND course_id = ? AND completed = 1`;
                        db.all(sql5, [req.session.user.account_id, courseId], (_, progRows) => {
                            const completedIds = (progRows || []).map(r => r.content_id);
                            res.render("content", {
                                course, contents: contents || [], inLibrary: true,
                                activeContent: content, result: correct ? "correct" : "wrong",
                                completedIds
                            });
                        });
                    });
                });
            };
            if (correct && !existing) {
                let sql6 = `INSERT INTO Progression (account_id, course_id, content_id, completed) VALUES
                            (?, ?, ?, 1)`;
                db.run(sql6, [req.session.user.account_id, courseId, contentId], (_) => {
                    let sql7 = `UPDATE Gamificate
                                SET xp = xp + 10,
                                last_active = DATE('now'),
                                level = (xp + 10) / 50
                                WHERE account_id = ?`;
                    db.run(sql7, [req.session.user.account_id], (_) => {
                        let sql8 = `SELECT *
                                    FROM Account
                                    WHERE account_id = ?`;
                        db.get(sql8, [req.session.user.account_id], (_, updUser) => {
                            req.session.user = updUser;
                            finish();
                        });
                    });
                });
            }
            else {
                finish();
            }
        });
    });
});

app.get("/leaderboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let sql1 = `SELECT Account.*, 
                (SELECT COUNT(*) FROM Library WHERE Library.account_id = Account.account_id) as lib_count,
                COALESCE(Gamificate.xp, 0) as xp,
                COALESCE(Gamificate.level, 0) as level,
                COALESCE(Gamificate.streak, 0) as streak
                FROM Account
                LEFT JOIN Gamificate ON Account.account_id = Gamificate.account_id
                WHERE Account.role = "student"
                ORDER BY xp DESC
                LIMIT 10`;
    db.all(sql1, (_, accounts) => {
        res.render("leaderboard", { accounts: accounts || [] });
    });
});

app.get("/profile", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let sql1 = `SELECT *
                FROM Account
                WHERE account_id = ?`;
    db.get(sql1, [req.session.user.account_id], (_, user) => {
        let sql2 = `SELECT * FROM Gamificate WHERE account_id = ?`;
        db.get(sql2, [req.session.user.account_id], (_, gamificate) => {
            res.render("profile", { profileUser: user, gamificate: gamificate || null, error: null, success: null });
        });
    });
});

app.post("/profile", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let { username, email, password } = req.body;
    if (!username || !email || !password) {
        let sql1 = `SELECT *
                    FROM Account
                    WHERE account_id = ?`;
        return db.get(sql1, [req.session.user.account_id], (_, user) => {
            let sql2 = `SELECT *
                        FROM Gamificate
                        WHERE account_id = ?`;
            db.get(sql2, [req.session.user.account_id], (_, gamificate) => {
                res.render("profile", { profileUser: user, gamificate: gamificate || null, error: "กรุณากรอกข้อมูลให้ครบ", success: null });
            });
        });
    }
    let sql3 = `UPDATE Account
                SET username = ?, email = ?, password = ?
                WHERE account_id = ?`;
    db.run(sql3, [username, email, password, req.session.user.account_id], (_) => {
        let sql4 = `SELECT *
                    FROM Account
                    WHERE account_id = ?`;
        db.get(sql4, [req.session.user.account_id], (_, user) => {
            req.session.user = user;
            let sql5 = `SELECT *
                        FROM Gamificate
                        WHERE account_id = ?`;
            db.get(sql5, [req.session.user.account_id], (_, gamificate) => {
                res.render("profile", { profileUser: user, gamificate: gamificate || null, error: null, success: "บันทึกข้อมูลเรียบร้อย" });
            });
        });
    });
});

app.get("/instructor", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT Course.*, Catagory.catagory_name,
                (SELECT COUNT(*) FROM Content WHERE Content.course_id = Course.course_id) as content_count
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id`;
    db.all(sql1, (_, courses) => {
        res.render("instructor", { courses: courses || [] });
    });
});

app.get("/instructor/create", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT *
                FROM Catagory`;
    db.all(sql1, (_, categories) => {
        res.render("instructor_create_course", { categories: categories || [], error: null });
    });
});

app.post("/instructor/create", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let { title, description, catagory_id } = req.body;
    let sql1 = `INSERT INTO Course (title, description, catagory_id) VALUES
                (?, ?, ?)`;
    db.run(sql1, [title, description, catagory_id], (_) => {
        res.redirect("/instructor");
    });
});

app.get("/instructor/edit/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let sql1 = `SELECT *
                FROM Course
                WHERE course_id = ?`;
    db.get(sql1, [courseId], (_, course) => {
        if (!course) {
            return res.redirect("/instructor");
        }
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id = ?`;
        db.all(sql2, [courseId], (_, contents) => {
            let sql3 = `SELECT *
                        FROM Catagory`;
            db.all(sql3, (_, categories) => {
                res.render("instructor_edit_course", { course, contents: contents || [], categories: categories || [], error: null });
            });
        });
    });
});

app.post("/instructor/edit/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let { title, description, catagory_id } = req.body;
    let sql1 = `UPDATE Course
                SET title = ?, description = ?, catagory_id = ?
                WHERE course_id = ?`;
    db.run(sql1, [title, description, catagory_id, courseId], (_) => {
        res.redirect(`/instructor/edit/${courseId}`);
    });
});

app.post("/instructor/delete/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let sql1 = `DELETE FROM Content
                WHERE course_id = ?`;
    db.run(sql1, [courseId], (_) => {
        let sql2 = `DELETE FROM Library
                    WHERE course_id = ?`;
        db.run(sql2, [courseId], (_) => {
            let sql3 = `DELETE FROM Progression
                        WHERE course_id = ?`;
            db.run(sql3, [courseId], (_) => {
                let sql4 = `DELETE FROM Course
                            WHERE course_id = ?`;
                db.run(sql4, [courseId], (_) => {
                    res.redirect("/instructor");
                });
            });
        });
    });
});

app.get("/instructor/create/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    res.render("instructor_create_content", { courseId: req.params.courseId, error: null });
});

app.post("/instructor/create/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `INSERT INTO Content (course_id, topic, content, Questions, A, B, C, D, Answer) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql1, [courseId, topic, content, Questions, A, B, C, D, Answer], (_) => {
        res.redirect(`/instructor/edit/${courseId}`);
    });
});

app.get("/instructor/edit/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let contentId = req.params.contentId;
    let sql1 = `SELECT *
                FROM Content
                WHERE content_id = ?`;
    db.get(sql1, [contentId], (_, content) => {
        if (!content) {
            return res.redirect(`/instructor/edit/${req.params.courseId}`);
        }
        res.render("instructor_edit_content", { content, error: null });
    });
});

app.post("/instructor/edit/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let { courseId, contentId } = req.params;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `UPDATE Content
                SET topic = ?, content = ?, Questions = ?, A = ?, B = ?, C = ?, D = ?, Answer = ?
                WHERE content_id = ?`;
    db.run(sql1, [topic, content, Questions, A, B, C, D, Answer, contentId], (_) => {
        res.redirect(`/instructor/edit/${courseId}`);
    });
});

app.post("/instructor/delete/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role !== "admin") {
        return res.redirect("/home");
    }
    let { courseId, contentId } = req.params;
    let sql1 = `DELETE FROM Content
                WHERE content_id = ?`;
    db.run(sql1, [contentId], (_) => {
        let sql2 = `DELETE FROM Progression
                    WHERE content_id = ?`;
        db.run(sql2, [contentId], (_) => {
            res.redirect(`/instructor/edit/${courseId}`);
        });
    });
});

app.listen(port, () => {
    console.log(`Codingo running on http://localhost:${port}`);
});
