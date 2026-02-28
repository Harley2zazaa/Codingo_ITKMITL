const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
const port = 3000;

let db = new sqlite3.Database("database.db", (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log("Connected to database.db");
});

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(session({
    secret: "codingo_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role != "admin") {
        return res.redirect("/");
    }
    next();
}

app.get("/", (req, res) => {
    res.render("home");
});

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

app.post("/register", (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.render("register", { error: "ข้อมูลไม่ถูกต้อง" });
    }
    db.get("SELECT account_id FROM Account WHERE email = ?", [email], (err, row) => {
        if (row) {
            return res.render("register", { error: "บัญชีนี้มีอยู่แล้วในระบบ" });
        }
        db.run("INSERT INTO Account (username, email, password, role, score) VALUES (?, ?, ?, 'student', 0)", [username, email, password], function (err) {
            if (err) {
                return res.render("register", { error: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
            }
            db.get("SELECT * FROM Account WHERE account_id = ?", [this.lastID], (err, user) => {
                req.session.user = { id: user.account_id, username: user.username, email: user.email, role: user.role, score: user.score };
                res.redirect("/");
            });
        });
    });
});

app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

app.post("/login", (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.render("login", { error: "กรุณากรอกข้อมูลให้ครบ" });
    }
    db.get("SELECT * FROM Account WHERE email = ? OR username = ?", [identifier, identifier], (err, user) => {
        if (err || !user || password != user.password) {
            return res.render("login", { error: "อีเมล ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }
        req.session.user = { id: user.account_id, username: user.username, email: user.email, role: user.role, score: user.score };
        res.redirect("/");
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

app.get("/search", (req, res) => {
    const keyword = (req.query.q || "").trim();
    const allQuery = `SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color, (SELECT COUNT(*) FROM Course_Content WHERE course_id = c.course_id) AS content_count
                        FROM Course c
                        LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
                        ORDER BY c.course_id DESC`;
    if (!keyword) {
        return db.all(allQuery, (err, allRows) => {
            res.render("search", { course: [], allCourses: allRows || [], keyword: "", notFound: false });
        });
    }
    const like = `%${keyword}%`;
    const query = `SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color, (SELECT COUNT(*) FROM Course_Content WHERE course_id = c.course_id) AS content_count
                    FROM Course c
                    LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
                    WHERE c.title LIKE ? OR cat.catagory_name LIKE ?
                    ORDER BY c.course_id DESC`;
    db.all(query, [like, like], (err, rows) => {
        if (err) {
            console.log(err.message);
        }
        db.all(allQuery, (err2, allRows) => {
            res.render("search", { course: rows || [], allCourses: allRows || [], keyword, notFound: !rows || rows.length == 0 });
        });
    });
});

app.get("/course/:id", (req, res) => {
    const courseId = req.params.id;
    const userId = req.session.user ? req.session.user.id : null;
    const msg = req.query.msg || null;
    db.get(`SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color, 'Admin' AS author
            FROM Course c
            LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
            WHERE c.course_id = ?`, [courseId], (err, course) => {
        if (err || !course) {
            return res.redirect("/");
        }
        db.all(`SELECT content_id AS id, course_id, topic AS title, content AS body, Questions, A, B, C, D, Answer FROM Course_Content WHERE course_id = ? ORDER BY content_id`, [courseId], (err, contents) => {
            if (!userId) {
                return res.render("course", { course, contents: contents || [], inLibrary: false, completedIds: [], msg });
            }
            db.get("SELECT storage_id FROM Account_Library WHERE account_id = ? AND course_id = ?", [userId, courseId], (err, libRow) => {
                db.all("SELECT content_id FROM Progression WHERE account_id = ? AND course_id = ? AND completed = 1", [userId, courseId], (err, progRows) => {
                    const completedIds = (progRows || []).map(r => r.content_id);
                    res.render("course", { course, contents: contents || [], inLibrary: !!libRow, completedIds, msg });
                });
            });
        });
    });
});

app.get("/library", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const query = `SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color, (SELECT COUNT(*) FROM Course_Content WHERE course_id = c.course_id) AS content_count, (SELECT COUNT(*) FROM Progression WHERE account_id = ? AND course_id = c.course_id AND completed = 1) AS done
                    FROM Account_Library al
                    JOIN Course c ON al.course_id = c.course_id
                    LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
                    WHERE al.account_id = ?
                    ORDER BY al.storage_id DESC`;
    db.all(query, [userId, userId], (err, rows) => {
        if (err) {
            console.log(err.message);
        }
        res.render("library", { course: rows || [], empty: !rows || rows.length == 0 });
    });
});

app.post("/library/add/:courseId", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const courseId = req.params.courseId;
    db.get("SELECT storage_id FROM Account_Library WHERE account_id = ? AND course_id = ?", [userId, courseId], (err, row) => {
        if (row) {
            return res.redirect(`/course/${courseId}?msg=already`);
        }
        db.run("INSERT INTO Account_Library (account_id, course_id) VALUES (?, ?)", [userId, courseId], () => {
            res.redirect(`/course/${courseId}?msg=added`);
        });
    });
});

app.post("/library/remove/:courseId", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const courseId = req.params.courseId;
    db.run("DELETE FROM Account_Library WHERE account_id = ? AND course_id = ?", [userId, courseId], () => {
        res.redirect(`/course/${courseId}?msg=removed`);
    });
});

app.post("/progress/complete/:contentId", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const contentId = req.params.contentId;
    db.get("SELECT course_id FROM Course_Content WHERE content_id = ?", [contentId], (err, row) => {
        if (err || !row) {
            return res.redirect("/library");
        }
        const courseId = row.course_id;
        db.get("SELECT progress_id FROM Progression WHERE account_id = ? AND content_id = ?", [userId, contentId], (err, existing) => {
            if (existing) return res.redirect(`/course/${courseId}?msg=completed`);
            db.run("INSERT INTO Progression (account_id, course_id, content_id, completed) VALUES (?, ?, ?, 1)", [userId, courseId, contentId], () => {
                db.run("UPDATE Account SET score = score + 20 WHERE account_id = ?", [userId], () => {
                    req.session.user.score += 20;
                    res.redirect(`/course/${courseId}?msg=completed`);
                });
            });
        });
    });
});

app.get("/leaderboard", (req, res) => {
    const query = `SELECT account_id AS id, username, score, (SELECT COUNT(*) FROM Account_Library WHERE account_id = Account.account_id) AS course_count
                    FROM Account
                    WHERE role = 'student'
                    ORDER BY score DESC
                    LIMIT 10`;
    db.all(query, (err, rows) => {
        if (err) {
            console.log(err.message);
        }
        res.render("leaderboard", { board: rows || [], empty: !rows || rows.length == 0 });
    });
});

app.get("/profile", requireLogin, (req, res) => {
    db.get("SELECT account_id AS id, username, email, role, score FROM Account WHERE account_id = ?", [req.session.user.id], (err, user) => {
        if (err) {
            console.log(err.message);
        }
        res.render("profile", { userData: user, error: null, success: null });
    });
});

app.post("/profile", requireLogin, (req, res) => {
    const { username, email } = req.body;
    if (!username || username.trim() == "" || !email || email.trim() == "") {
        db.get("SELECT account_id AS id, username, email, role, score FROM Account WHERE account_id = ?", [req.session.user.id], (err, user) => {
            res.render("profile", { userData: user, error: "ข้อมูลใหม่ไม่ตรงตามเงื่อนไข", success: null });
        });
        return;
    }
    db.run("UPDATE Account SET username = ?, email = ? WHERE account_id = ?", [username.trim(), email.trim(), req.session.user.id], () => {
        req.session.user.username = username.trim();
        db.get("SELECT account_id AS id, username, email, role, score FROM Account WHERE account_id = ?", [req.session.user.id], (err, user) => {
            res.render("profile", { userData: user, error: null, success: "บันทึกข้อมูลเรียบร้อยแล้ว" });
        });
    });
});

app.get("/admin", requireAdmin, (req, res) => {
    const query = `SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color, (SELECT COUNT(*) FROM Course_Content WHERE course_id = c.course_id) AS content_count
                    FROM Course c
                    LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
                    ORDER BY c.course_id DESC`;
    db.all(query, (err, rows) => {
        if (err) {
            console.log(err.message);
        }
        res.render("admin", { course: rows || [], msg: req.query.msg || null });
    });
});

app.get("/admin/add", requireAdmin, (req, res) => {
    db.all("SELECT * FROM Catagory ORDER BY catagory_id", (err, categories) => {
        res.render("admin_form", { course: null, error: null, categories: categories || [] });
    });
});

app.post("/admin/add", requireAdmin, (req, res) => {
    const { title, description, catagory_id } = req.body;
    if (!title || !description) {
        return db.all("SELECT * FROM Catagory ORDER BY catagory_id", (err, categories) => {
            res.render("admin_form", { course: null, error: "ข้อมูลที่ต้องการยังไม่ครบถ้วน", categories: categories || [] });
        });
    }
    db.run("INSERT INTO Course (title, description, catagory_id) VALUES (?, ?, ?)", [title, description, catagory_id || null], () => {
        res.redirect("/admin?msg=added");
    });
});

app.get("/admin/edit/course/:id", requireAdmin, (req, res) => {
    db.get("SELECT course_id AS id, title, description, catagory_id FROM Course WHERE course_id = ?", [req.params.id], (err, course) => {
        if (err || !course) {
            return res.redirect("/admin");
        }
        db.all("SELECT * FROM Catagory ORDER BY catagory_id", (err, categories) => {
            res.render("admin_form", { course, error: null, categories: categories || [] });
        });
    });
});

app.post("/admin/edit/course/:id", requireAdmin, (req, res) => {
    const { title, description, catagory_id } = req.body;
    if (!title || !description) {
        db.get("SELECT course_id AS id, title, description, catagory_id FROM Course WHERE course_id = ?", [req.params.id], (err, course) => {
            db.all("SELECT * FROM Catagory ORDER BY catagory_id", (err2, categories) => {
                res.render("admin_form", { course, error: "ข้อมูลที่ต้องการยังไม่ครบถ้วน", categories: categories || [] });
            });
        });
        return;
    }
    db.run("UPDATE Course SET title = ?, description = ?, catagory_id = ? WHERE course_id = ?", [title, description, catagory_id || null, req.params.id], () => {
        res.redirect("/admin?msg=edited");
    });
});

app.post("/admin/delete/course/:id", requireAdmin, (req, res) => {
    const courseId = req.params.id;
    db.run("DELETE FROM Progression WHERE course_id = ?", [courseId], () => {
        db.run("DELETE FROM Account_Library WHERE course_id = ?", [courseId], () => {
            db.run("DELETE FROM Course_Content WHERE course_id = ?", [courseId], () => {
                db.run("DELETE FROM Course WHERE course_id = ?", [courseId], () => {
                    res.redirect("/admin?msg=deleted");
                });
            });
        });
    });
});

app.get("/admin/edit/course/:id/content", requireAdmin, (req, res) => {
    db.get(`SELECT c.course_id AS id, c.title, c.description, cat.catagory_name AS category, cat.color
            FROM Course c
            LEFT JOIN Catagory cat ON c.catagory_id = cat.catagory_id
            WHERE c.course_id = ?`, [req.params.id], (err, course) => {
        if (err || !course) {
            return res.redirect("/admin");
        }
        db.all(`SELECT content_id AS id, course_id, topic AS title, content AS body, Questions, A, B, C, D, Answer
                FROM Course_Content WHERE course_id = ? ORDER BY content_id`, [req.params.id], (err, rows) => {
            res.render("admin_contents", { course, contents: rows || [], msg: req.query.msg || null });
        });
    });
});

app.post("/admin/add/course/:id/content", requireAdmin, (req, res) => {
    const { title, body, Questions, A, B, C, D, Answer } = req.body;
    if (!title) {
        return res.redirect(`/admin/edit/course/${req.params.id}/content?msg=error`);
    }
    db.run("INSERT INTO Course_Content (course_id, topic, content, Questions, A, B, C, D, Answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [req.params.id, title, body || "", Questions || "", A || "", B || "", C || "", D || "", Answer || ""], () => {
        res.redirect(`/admin/edit/course/${req.params.id}/content?msg=added`);
    });
});

app.get("/admin/edit/course/:id/content/:cid", requireAdmin, (req, res) => {
    db.get(`SELECT content_id AS id, course_id, topic AS title, content AS body, Questions, A, B, C, D, Answer
            FROM Course_Content WHERE content_id = ?`, [req.params.cid], (err, content) => {
        if (err || !content) {
            return res.redirect(`/admin/edit/course/${req.params.id}/content`);
        }
        db.get("SELECT course_id AS id, title FROM Course WHERE course_id = ?", [content.course_id], (err, course) => {
            if (err || !course) {
                return res.redirect("/admin");
            }
            res.render("admin_content_edit", { content, course, error: null });
        });
    });
});

app.post("/admin/edit/course/:id/content/:cid", requireAdmin, (req, res) => {
    const { title, body, Questions, A, B, C, D, Answer } = req.body;
    db.get("SELECT course_id FROM Course_Content WHERE content_id = ?", [req.params.cid], (err, row) => {
        if (err || !row) {
            return res.redirect("/admin");
        }
        const courseId = row.course_id;
        if (!title) {
            db.get(`SELECT content_id AS id, course_id, topic AS title, content AS body, Questions, A, B, C, D, Answer
                    FROM Course_Content WHERE content_id = ?`, [req.params.cid], (err2, content) => {
                db.get("SELECT course_id AS id, title FROM Course WHERE course_id = ?", [courseId], (err3, course) => {
                    res.render("admin_content_edit", { content, course, error: "ชื่อเนื้อหาไม่สามารถเว้นว่างได้" });
                });
            });
            return;
        }
        db.run("UPDATE Course_Content SET topic = ?, content = ?, Questions = ?, A = ?, B = ?, C = ?, D = ?, Answer = ? WHERE content_id = ?", [title, body || "", Questions || "", A || "", B || "", C || "", D || "", Answer || "", req.params.cid], () => {
            res.redirect(`/admin/edit/course/${courseId}/content/${req.params.cid}?msg=edited`);
        });
    });
});

app.post("/admin/delete/course/:id/content/:cid", requireAdmin, (req, res) => {
    db.get("SELECT course_id FROM Course_Content WHERE content_id = ?", [req.params.cid], (err, row) => {
        const courseId = row ? row.course_id : null;
        db.run("DELETE FROM Course_Content WHERE content_id = ?", [req.params.cid], () => {
            res.redirect(`/admin/edit/course/${courseId}/content?msg=deleted`);
        });
    });
});

app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`);
});
