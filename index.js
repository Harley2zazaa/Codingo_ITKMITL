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

function requireSignin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    next();
}

function requireInstructor(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    if (req.session.user.role != "instructor") {
        return res.redirect("/home");
    }
    next();
}

app.get("/", (req, res) => {
    res.redirect("/home");
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
    db.get(sql1, [identifier, identifier, password], (err1, user) => {
        if (err1) throw err1;
        if (!user) {
            return res.render("signin", { error: "อีเมล ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }
        let sql2 = `SELECT * FROM Gamificate WHERE account_id = ?`;
        db.get(sql2, [user.account_id], (err2, gamificate) => {
            if (err2) throw err2;
            let today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
            let yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
            let lastActive = gamificate.last_active;
            let newStreak = gamificate.streak;
            if (lastActive == today) {
                req.session.user = user;
                return res.redirect("/home");
            }
            newStreak = lastActive == yesterday ? newStreak + 1 : 0;
            let sql3 = `UPDATE Gamificate
                        SET last_active = ?,
                        streak = ?
                        WHERE account_id = ?`;
            db.run(sql3, [today, newStreak, user.account_id], (err3) => {
                if (err3) throw err3;
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
    let { username, email, password } = req.body;
    let sql1 = `SELECT *
                FROM Account
                WHERE username = ? OR email = ?`;
    db.all(sql1, [username, email], (err1, existing) => {
        if (err1) throw err1;
        if (existing.length > 0) {
            return res.render("register", { error: "ชื่อผู้ใช้ หรืออีเมลนี้มีในระบบแล้ว" });
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
                db.get(sql4, [newAccountId], (err2, user) => {
                    if (err2) throw err2;
                    req.session.user = user;
                    res.redirect("/home");
                });
            });
        });
    });
});

app.get("/streak", requireSignin, (req, res) => {
    if (req.session.user.role == "instructor") {
        return res.redirect("/home");
    }
    let sql1 = `SELECT *
                FROM Gamificate
                WHERE account_id = ?`;
    db.get(sql1, [req.session.user.account_id], (err1, gamificate) => {
        if (err1) throw err1;
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
    db.all(sql1, (err1, courses) => {
        if (err1) throw err1;
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
    db.all(sql1, [`%${search}%`, `%${search}%`], (err1, courses) => {
        if (err1) throw err1;
        res.render("course", { courses: courses || [], search });
    });
});

app.get("/course/:courseId", (req, res) => {
    let courseId = req.params.courseId;
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id
                WHERE Course.course_id = ?`;
    db.get(sql1, [courseId], (err1, course) => {
        if (err1) throw err1;
        if (!course) {
            return res.redirect("/course");
        }
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id = ?`;
        db.all(sql2, [courseId], (err2, contents) => {
            if (err2) throw err2;
            if (!req.session.user) {
                return res.render("content", { course, contents: contents || [], inLibrary: false, activeContentId: null, result: null, completedIds: [] });
            }
            let sql3 = `SELECT *
                        FROM Library
                        WHERE account_id = ? AND course_id = ?`;
            db.get(sql3, [req.session.user.account_id, courseId], (err3, lib) => {
                if (err3) throw err3;
                if (lib) {
                    return res.redirect(`/library/${courseId}`);
                }
                res.render("content", { course, contents: contents || [], inLibrary: false, activeContentId: null, result: null, completedIds: [] });
            });
        });
    });
});

app.post("/course/add/:courseId", requireSignin, (req, res) => {
    let courseId = req.params.courseId;
    let sql1 = `SELECT *
                FROM Library
                WHERE account_id = ? AND course_id = ?`;
    db.get(sql1, [req.session.user.account_id, courseId], (err1, existing) => {
        if (err1) throw err1;
        if (existing) {
            return res.redirect(`/library/${courseId}`);
        }
        let sql2 = `INSERT INTO Library (account_id, course_id) VALUES
                    (?, ?)`;
        db.run(sql2, [req.session.user.account_id, courseId], (err2) => {
            if (err2) throw err2;
            res.redirect(`/library/${courseId}`);
        });
    });
});

app.get("/library", requireSignin, (req, res) => {
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color,
                (SELECT COUNT(*) FROM Content WHERE Content.course_id = Course.course_id) as total,
                (SELECT COUNT(*) FROM Progression WHERE Progression.course_id = Course.course_id AND Progression.account_id = ? AND Progression.completed = 1) as done
                FROM Library
                JOIN Course
                ON Library.course_id = Course.course_id
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id
                WHERE Library.account_id = ?`;
    db.all(sql1, [req.session.user.account_id, req.session.user.account_id], (err1, courses) => {
        if (err1) throw err1;
        res.render("library", { courses: courses || [] });
    });
});

app.get("/library/:courseId", requireSignin, (req, res) => {
    let accountId = req.session.user.account_id;
    let courseId = req.params.courseId;
    let activeContentId = req.query.content || null;
    let result = req.query.result || null;
    let sql1 = `SELECT *
                FROM Library
                WHERE account_id = ? AND course_id = ?`;
    db.get(sql1, [accountId, courseId], (err1, lib) => {
        if (err1) throw err1;
        if (!lib) {
            return res.redirect(`/course/${courseId}`);
        }
        let sql2 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                    FROM Course JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                    WHERE Course.course_id = ?`;
        db.get(sql2, [courseId], (err2, course) => {
            if (err2) throw err2;
            let sql3 = `SELECT *
                        FROM Content
                        WHERE course_id = ?`;
            db.all(sql3, [courseId], (err3, contents) => {
                if (err3) throw err3;
                let sql4 = `SELECT content_id
                            FROM Progression
                            WHERE account_id = ? AND course_id = ? AND completed = 1`;
                db.all(sql4, [accountId, courseId], (err4, progRows) => {
                    if (err4) throw err4;
                    let completedIds = (progRows || []).map((r) => r.content_id);
                    res.render("content", { course, contents: contents || [], inLibrary: true, activeContentId, result, completedIds });
                });
            });
        });
    });
});

app.post("/library/remove/:courseId", requireSignin, (req, res) => {
    let sql1 = `DELETE FROM Library
                WHERE account_id = ? AND course_id = ?`;
    db.run(sql1, [req.session.user.account_id, req.params.courseId], (err1) => {
        if (err1) throw err1;
        res.redirect("/library");
    });
});

app.post("/library/:courseId/:contentId", requireSignin, (req, res) => {
    let accountId = req.session.user.account_id;
    let courseId = req.params.courseId;
    let contentId = req.params.contentId;
    let answer = req.body.answer;
    let sql1 = `SELECT *
                FROM Content
                WHERE content_id = ?`;
    db.get(sql1, [contentId], (err1, content) => {
        if (err1) throw err1;
        if (!content || answer != content.Answer) {
            return res.redirect(`/library/${courseId}?content=${contentId}&result=wrong`);
        }
        let sql2 = `SELECT *
                    FROM Progression
                    WHERE account_id = ? AND course_id = ? AND content_id = ?`;
        db.get(sql2, [accountId, courseId, contentId], (err2, alreadyDone) => {
            if (err2) throw err2;
            if (alreadyDone) {
                return res.redirect(`/library/${courseId}?content=${contentId}&result=correct`);
            }
            let sql3 = `INSERT INTO Progression (account_id, course_id, content_id, completed)
                        VALUES (?, ?, ?, 1)`;
            db.run(sql3, [accountId, courseId, contentId], (err3) => {
                if (err3) throw err3;
                let sql4 = `UPDATE Gamificate
                            SET xp = xp + 10, level = (xp + 10) / 50
                            WHERE account_id = ?`;
                db.run(sql4, [accountId], (err4) => {
                    if (err4) throw err4;
                    let sql5 = `SELECT *
                                FROM Account
                                WHERE account_id = ?`;
                    db.get(sql5, [accountId], (err5, updUser) => {
                        if (err5) throw err5;
                        req.session.user = updUser;
                        res.redirect(`/library/${courseId}?content=${contentId}&result=correct`);
                    });
                });
            });
        });
    });
});

app.get("/leaderboard", requireSignin, (req, res) => {
    let sql1 = `SELECT Account.*,
                COALESCE(Gamificate.xp, 0) as xp,
                COALESCE(Gamificate.level, 0) as level,
                COALESCE(Gamificate.streak, 0) as streak
                FROM Account
                LEFT JOIN Gamificate ON Account.account_id = Gamificate.account_id
                WHERE Account.role = "student"
                ORDER BY xp DESC
                LIMIT 10`;
    db.all(sql1, (err1, accounts) => {
        if (err1) throw err1;
        res.render("leaderboard", { accounts: accounts || [] });
    });
});

app.get("/progression", requireSignin, (req, res) => {
    let accountId = req.session.user.account_id;
    let sql1 = `SELECT Course.*, Catagory.catagory_name, Catagory.color
                FROM Library
                JOIN Course ON Library.course_id = Course.course_id
                JOIN Catagory ON Course.catagory_id = Catagory.catagory_id
                WHERE Library.account_id = ?`;
    db.all(sql1, [accountId], (err1, courses) => {
        if (err1) throw err1;
        if (!courses || courses.length == 0) {
            return res.render("progression", { courses: [], contents: [], completedIds: [] });
        }
        let courseIds = courses.map((c) => c.course_id);
        let placeholders = courseIds.map(() => "?").join(",");
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id IN (${placeholders})`;
        db.all(sql2, courseIds, (err2, contents) => {
            if (err2) throw err2;
            let sql3 = `SELECT content_id
                        FROM Progression
                        WHERE account_id = ? AND completed = 1`;
            db.all(sql3, [accountId], (err3, progRows) => {
                if (err3) throw err3;
                let completedIds = (progRows || []).map((r) => r.content_id);
                res.render("progression", { courses: courses || [], contents: contents || [], completedIds });
            });
        });
    });
});

app.get("/profile", requireSignin, (req, res) => {
    let sql1 = `SELECT *
                FROM Account
                WHERE account_id = ?`;
    db.get(sql1, [req.session.user.account_id], (err1, user) => {
        if (err1) throw err1;
        let sql2 = `SELECT *
                    FROM Gamificate
                    WHERE account_id = ?`;
        db.get(sql2, [req.session.user.account_id], (err2, gamificate) => {
            if (err2) throw err2;
            res.render("profile", { profileUser: user, gamificate: gamificate || null, success: null, error: req.query.error || null });
        });
    });
});

app.post("/profile", requireSignin, (req, res) => {
    let { username, email, password } = req.body;
    let sql1 = `SELECT *
                FROM Account
                WHERE (email = ? OR username = ?) AND account_id != ?`;
    db.all(sql1, [email, username, req.session.user.account_id], (err1, existing) => {
        if (err1) throw err1;
        if (existing.length > 0) {
            return res.redirect("/profile?error=ชื่อผู้ใช้ หรืออีเมลนี้มีในระบบแล้ว");
        }
        let sql2 = `UPDATE Account
                    SET username = ?, email = ?, password = ?
                    WHERE account_id = ?`;
        db.run(sql2, [username, email, password, req.session.user.account_id], (err2) => {
            if (err2) throw err2;
            let sql3 = `SELECT *
                        FROM Account
                        WHERE account_id = ?`;
            db.get(sql3, [req.session.user.account_id], (err3, user) => {
                if (err3) throw err3;
                req.session.user = user;
                let sql4 = `SELECT *
                            FROM Gamificate
                            WHERE account_id = ?`;
                db.get(sql4, [req.session.user.account_id], (err4, gamificate) => {
                    if (err4) throw err4;
                    res.render("profile", { profileUser: user, gamificate: gamificate || null, success: "บันทึกข้อมูลเรียบร้อย", error: null });
                });
            });
        });
    });
});

app.get("/instructor", requireInstructor, (req, res) => {
    let sql1 = `SELECT Course.*, Catagory.catagory_name,
                (SELECT COUNT(*) FROM Content WHERE Content.course_id = Course.course_id) as content_count
                FROM Course
                JOIN Catagory
                ON Course.catagory_id = Catagory.catagory_id`;
    db.all(sql1, (err1, courses) => {
        if (err1) throw err1;
        res.render("instructor", { courses: courses || [], success: req.query.success || null });
    });
});

app.get("/instructor/create", requireInstructor, (req, res) => {
    let sql1 = `SELECT *
                FROM Catagory`;
    db.all(sql1, (err1, categories) => {
        if (err1) throw err1;
        res.render("instructor_create_course", { categories: categories || [] });
    });
});

app.post("/instructor/create", requireInstructor, (req, res) => {
    let { title, description, catagory_id } = req.body;
    let sql1 = `INSERT INTO Course (title, description, catagory_id) VALUES
                (?, ?, ?)`;
    db.run(sql1, [title, description, catagory_id], (err1) => {
        if (err1) throw err1;
        res.redirect("/instructor?success=created");
    });
});

app.get("/instructor/edit/:courseId", requireInstructor, (req, res) => {
    let courseId = req.params.courseId;
    let sql1 = `SELECT *
                FROM Course
                WHERE course_id = ?`;
    db.get(sql1, [courseId], (err1, course) => {
        if (err1) throw err1;
        if (!course) {
            return res.redirect("/instructor");
        }
        let sql2 = `SELECT *
                    FROM Content
                    WHERE course_id = ?`;
        db.all(sql2, [courseId], (err2, contents) => {
            if (err2) throw err2;
            let sql3 = `SELECT *
                        FROM Catagory`;
            db.all(sql3, (err3, categories) => {
                if (err3) throw err3;
                res.render("instructor_edit_course", { course, contents: contents || [], categories: categories || [], success: req.query.success || null });
            });
        });
    });
});

app.post("/instructor/edit/:courseId", requireInstructor, (req, res) => {
    let courseId = req.params.courseId;
    let { title, description, catagory_id } = req.body;
    let sql1 = `UPDATE Course
                SET title = ?, description = ?, catagory_id = ?
                WHERE course_id = ?`;
    db.run(sql1, [title, description, catagory_id, courseId], (err1) => {
        if (err1) throw err1;
        res.redirect(`/instructor/edit/${courseId}?success=updated`);
    });
});

app.post("/instructor/delete/:courseId", requireInstructor, (req, res) => {
    let courseId = req.params.courseId;
    let sql1 = `DELETE FROM Progression
                WHERE course_id = ?`;
    db.run(sql1, [courseId], (err1) => {
        if (err1) throw err1;
        let sql2 = `DELETE FROM Library
                    WHERE course_id = ?`;
        db.run(sql2, [courseId], (err2) => {
            if (err2) throw err2;
            let sql3 = `DELETE FROM Content
                        WHERE course_id = ?`;
            db.run(sql3, [courseId], (err3) => {
                if (err3) throw err3;
                let sql4 = `DELETE FROM Course
                            WHERE course_id = ?`;
                db.run(sql4, [courseId], (err4) => {
                    if (err4) throw err4;
                    res.redirect("/instructor?success=deleted");
                });
            });
        });
    });
});

app.get("/instructor/create/:courseId", requireInstructor, (req, res) => {
    res.render("instructor_create_content", { courseId: req.params.courseId });
});

app.post("/instructor/create/:courseId", requireInstructor, (req, res) => {
    let courseId = req.params.courseId;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `INSERT INTO Content (course_id, topic, content, Questions, A, B, C, D, Answer) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql1, [courseId, topic, content, Questions, A, B, C, D, Answer], (err1) => {
        if (err1) throw err1;
        res.redirect(`/instructor/edit/${courseId}?success=created`);
    });
});

app.get("/instructor/edit/:courseId/:contentId", requireInstructor, (req, res) => {
    let contentId = req.params.contentId;
    let sql1 = `SELECT *
                FROM Content
                WHERE content_id = ?`;
    db.get(sql1, [contentId], (err1, content) => {
        if (err1) throw err1;
        if (!content) {
            return res.redirect(`/instructor/edit/${req.params.courseId}`);
        }
        res.render("instructor_edit_content", { content, success: req.query.success || null });
    });
});

app.post("/instructor/edit/:courseId/:contentId", requireInstructor, (req, res) => {
    let { courseId, contentId } = req.params;
    let { topic, content, Questions, A, B, C, D, Answer } = req.body;
    let sql1 = `UPDATE Content
                SET topic = ?, content = ?, Questions = ?, A = ?, B = ?, C = ?, D = ?, Answer = ?
                WHERE content_id = ?`;
    db.run(sql1, [topic, content, Questions, A, B, C, D, Answer, contentId], (err1) => {
        if (err1) throw err1;
        res.redirect(`/instructor/edit/${courseId}?success=updated`);
    });
});

app.post("/instructor/delete/:courseId/:contentId", requireInstructor, (req, res) => {
    let { courseId, contentId } = req.params;
    let sql1 = `DELETE FROM Progression
                WHERE content_id = ?`;
    db.run(sql1, [contentId], (err1) => {
        if (err1) throw err1;
        let sql2 = `DELETE FROM Content
                    WHERE content_id = ?`;
        db.run(sql2, [contentId], (err2) => {
            if (err2) throw err2;
            res.redirect(`/instructor/edit/${courseId}?success=deleted`);
        });
    });
});

app.listen(port, () => {
    console.log(`Codingo running on http://localhost:${port}`);
});
