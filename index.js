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
        let sql2 = `SELECT * FROM Gamificate WHERE account_id = ?`;
        db.get(sql2, [user.account_id], (_, gamificate) => {
            let today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
            let yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
            let lastActive = gamificate.last_active;
            let newStreak = gamificate.streak;
            if (lastActive == today) {
                req.session.user = user;
                return res.redirect("/home");
            }
            newStreak = lastActive == yesterday ? newStreak + 1 : 1;
            let sql3 = `UPDATE Gamificate
                        SET last_active = DATE(DATETIME('now', '+7 hours')),
                        streak = ?
                        WHERE account_id = ?`;
            db.run(sql3, [newStreak, user.account_id], (_) => {
                req.session.user = user;
                res.redirect("/streak");
            });
        });
    });
});

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

app.post("/register", (req, res) => {
    let { email, password, username } = req.body;
    let sql1 = `SELECT *
                FROM Account
                WHERE email = ? OR username = ?`;
    db.all(sql1, [email, username], (_, existing) => {
        if (existing.length > 0) {
            return res.render("register", { error: "ชื่อผู้ใช้หรืออีเมลนี้มีในระบบแล้ว" });
        }
        let sql2 = `INSERT INTO Account (username, email, password) VALUES
                    (?, ?, ?)`;
        db.run(sql2, [username, email, password], function (err) {
            if (err) {
                return res.render("register", { error: "เกิดข้อผิดพลาด" });
            }
            let newAccountId = this.lastID;
            let sql3 = `INSERT INTO Gamificate (account_id, xp, last_active, level, streak) VALUES
                        (?, 0, DATE(DATETIME('now', '+7 hours')), 0, 0)`;
            db.run(sql3, [newAccountId], (err) => {
                if (err) {
                    return res.render("register", { error: "เกิดข้อผิดพลาด" });
                }
                let sql4 = `SELECT *
                            FROM Account
                            WHERE account_id = ?`;
                db.get(sql4, [newAccountId], (_, user) => {
                    req.session.user = user;
                    res.redirect("/home");
                });
            });
        });
    });
});

app.get("/streak", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role == "admin") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT *
                FROM Gamificate
                WHERE account_id = ?`;
    db.get(sql1, [req.session.user.account_id], (_, gamificate) => {
        res.render("streak", { gamificate });
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
    let accountId = req.session.user.account_id;
    let courseId = req.params.courseId;
    let activeContentId = req.query.content || null;
    let result = req.query.result || null;
    let sql1 = `SELECT *
                FROM Library
                WHERE account_id = ? AND course_id = ?`;
    db.get(sql1, [accountId, courseId], (_, lib) => {
        if (!lib) {
            return res.redirect(`/course/${courseId}`);
        }
        let sql2 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                    FROM Course JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                    WHERE Course.course_id = ?`;
        db.get(sql2, [courseId], (_, course) => {
            let sql3 = `SELECT *
                        FROM Content
                        WHERE course_id = ?`;
            db.all(sql3, [courseId], (_, contents) => {
                let sql4 = `SELECT content_id
                            FROM Progression
                            WHERE account_id = ? AND course_id = ? AND completed = 1`;
                db.all(sql4, [accountId, courseId], (_, progRows) => {
                    let completedIds = [];
                    for (let i = 0; i < (progRows || []).length; i++) {
                        completedIds.push(progRows[i].content_id);
                    }
                    res.render("content", { course, contents: contents || [], inLibrary: true, activeContentId, result, completedIds });
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
                WHERE account_id = ? AND course_id = ?`;
    db.run(sql1, [req.session.user.account_id, req.params.courseId], () => {
        res.redirect("/library");
    });
});

app.post("/library/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    let accountId = req.session.user.account_id;
    let courseId = req.params.courseId;
    let contentId = req.params.contentId;
    let answer = req.body.answer;
    let sql1 = `SELECT *
                FROM Content
                WHERE content_id = ?`;
    db.get(sql1, [contentId], (_, content) => {
        let correct = content && answer == content.Answer;
        if (!correct) {
            return res.redirect(`/library/${courseId}?content=${contentId}&result=wrong`);
        }
        let sql2 = `SELECT *
                    FROM Progression
                    WHERE account_id = ? AND course_id = ? AND content_id = ?`;
        db.get(sql2, [accountId, courseId, contentId], (_, alreadyDone) => {
            if (alreadyDone) {
                return res.redirect(`/library/${courseId}?content=${contentId}&result=correct`);
            }
            let sql3 = `INSERT INTO Progression (account_id, course_id, content_id, completed)
                        VALUES (?, ?, ?, 1)`;
            db.run(sql3, [accountId, courseId, contentId], () => {
                let sql4 = `UPDATE Gamificate
                            SET xp = xp + 10
                            WHERE account_id = ?`;
                db.run(sql4, [accountId], () => {
                    let sql5 = `UPDATE Gamificate
                                SET level = xp / 50
                                WHERE account_id = ?`;
                    db.run(sql5, [accountId], () => {
                        let sql6 = `SELECT *
                                    FROM Account
                                    WHERE account_id = ?`;
                        db.get(sql6, [accountId], (_, updUser) => {
                            req.session.user = updUser;
                            res.redirect(`/library/${courseId}?content=${contentId}&result=correct`);
                        });
                    });
                });
            });
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
    let sql1 = `UPDATE Account
                SET username = ?, email = ?, password = ?
                WHERE account_id = ?`;
    db.run(sql1, [username, email, password, req.session.user.account_id], (_) => {
        let sql2 = `SELECT *
                    FROM Account
                    WHERE account_id = ?`;
        db.get(sql2, [req.session.user.account_id], (_, user) => {
            req.session.user = user;
            let sql3 = `SELECT *
                        FROM Gamificate
                        WHERE account_id = ?`;
            db.get(sql3, [req.session.user.account_id], (_, gamificate) => {
                res.render("profile", { profileUser: user, gamificate: gamificate || null, error: null, success: "บันทึกข้อมูลเรียบร้อย" });
            });
        });
    });
});

app.get("/instructor", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT Course.*, Catagory.catagory_name,
                (SELECT COUNT(*) FROM Content WHERE Content.course_id = Course.course_id) as content_count
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id`;
    db.all(sql1, (_, courses) => {
        res.render("instructor", { courses: courses || [], success: req.query.success || null });
    });
});

app.get("/instructor/create", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT *
                FROM Catagory`;
    db.all(sql1, (_, categories) => {
        res.render("instructor_create_course", { categories: categories || [] });
    });
});

app.post("/instructor/create", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let { title, description, catagory_id } = req.body;
    let sql1 = `INSERT INTO Course (title, description, catagory_id) VALUES
                (?, ?, ?)`;
    db.run(sql1, [title, description, catagory_id], (_) => {
        res.redirect("/instructor?success=created");
    });
});

app.get("/instructor/edit/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
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
                res.render("instructor_edit_course", { course, contents: contents || [], categories: categories || [], success: req.query.success || null });
            });
        });
    });
});

app.post("/instructor/edit/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let { title, description, catagory_id } = req.body;
    let sql1 = `UPDATE Course
                SET title = ?, description = ?, catagory_id = ?
                WHERE course_id = ?`;
    db.run(sql1, [title, description, catagory_id, courseId], (_) => {
        res.redirect(`/instructor/edit/${courseId}?success=updated`);
    });
});

app.post("/instructor/delete/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
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
                    res.redirect("/instructor?success=deleted");
                });
            });
        });
    });
});

app.get("/instructor/create/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    res.render("instructor_create_content", { courseId: req.params.courseId });
});

app.post("/instructor/create/:courseId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let courseId = req.params.courseId;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `INSERT INTO Content (course_id, topic, content, Questions, A, B, C, D, Answer) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql1, [courseId, topic, content, Questions, A, B, C, D, Answer], (_) => {
        res.redirect(`/instructor/edit/${courseId}?success=created`);
    });
});

app.get("/instructor/edit/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
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
        res.render("instructor_edit_content", { content, success: req.query.success || null });
    });
});

app.post("/instructor/edit/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let { courseId, contentId } = req.params;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `UPDATE Content
                SET topic = ?, content = ?, Questions = ?, A = ?, B = ?, C = ?, D = ?, Answer = ?
                WHERE content_id = ?`;
    db.run(sql1, [topic, content, Questions, A, B, C, D, Answer, contentId], (_) => {
        res.redirect(`/instructor/edit/${courseId}?success=updated`);
    });
});

app.post("/instructor/delete/:courseId/:contentId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "admin") {
        return res.redirect("/home");
    }
    let { courseId, contentId } = req.params;
    let sql1 = `DELETE FROM Content
                WHERE content_id = ?`;
    db.run(sql1, [contentId], (_) => {
        let sql2 = `DELETE FROM Progression
                    WHERE content_id = ?`;
        db.run(sql2, [contentId], (_) => {
            res.redirect(`/instructor/edit/${courseId}?success=deleted`);
        });
    });
});

app.get("/progression", (req, res) => {
    if (!req.session.user) return res.redirect("/signin");
    let accountId = req.session.user.account_id;
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Library
                JOIN Course ON Library.course_id = Course.course_id
                JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                WHERE Library.account_id = ?`;
    db.all(sql1, [accountId], (_, courses) => {
        if (!courses || courses.length == 0) {
            return res.render("progression", { courses: [], contents: [], completedIds: [] });
        }
        let courseIds = [];
        for (let i = 0; i < courses.length; i++) {
            courseIds.push(courses[i].course_id);
        }
        let placeholders = "";
        for (let i = 0; i < courseIds.length; i++) {
            placeholders += (i > 0 ? "," : "") + "?";
        }
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id IN (${placeholders})`;
        db.all(sql2, courseIds, (_, contents) => {
            let sql3 = `SELECT content_id 
                        FROM Progression
                        WHERE account_id = ? AND completed = 1`;
            db.all(sql3, [accountId], (_, progRows) => {
                let completedIds = [];
                for (let i = 0; i < (progRows || []).length; i++) {
                    completedIds.push(progRows[i].content_id);
                }
                res.render("progression", { courses: courses || [], contents: contents || [], completedIds });
            });
        });
    });
});

app.listen(port, () => {
    console.log(`Codingo running on http://localhost:${port}`);
});
