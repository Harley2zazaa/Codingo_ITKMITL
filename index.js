const express = require("express");
const path    = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt  = require("bcryptjs");
const session = require("express-session");

const app  = express();
const port = 3000;

// ── เชื่อมต่อฐานข้อมูล ───────────────────────────────────
let db = new sqlite3.Database("database.db", (err) => {
    if (err) return console.error(err.message);
    console.log("Connected to database.db");
});

// ── Static / View Engine / Body Parser ──────────────
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(session({
    secret: "lms_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// แนบ user ให้ทุก view เรียกใช้ได้ผ่าน locals
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ── Helper middleware ────────────────────────────────
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== "admin") return res.redirect("/");
    next();
}

// ════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════

// GET /register
app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

// POST /register — UC-10
app.post("/register", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.render("register", { error: "ข้อมูลไม่ถูกต้อง" });
    }

    db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if (row) {
            return res.render("register", { error: "บัญชีนี้มีอยู่แล้วในระบบ" });
        }
        const hash = bcrypt.hashSync(password, 10);
        db.run(
            "INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)",
            [username, email, hash, username],
            function (err) {
                if (err) return res.render("register", { error: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
                db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => {
                    req.session.user = { id: user.id, username: user.username, nickname: user.nickname, role: user.role, score: user.score };
                    res.redirect("/");
                });
            }
        );
    });
});

// GET /login
app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// POST /login
app.post("/login", (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.render("login", { error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    // รับได้ทั้ง email หรือ username
    db.get("SELECT * FROM users WHERE email = ? OR username = ?", [identifier, identifier], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.render("login", { error: "อีเมล ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }
        req.session.user = { id: user.id, username: user.username, nickname: user.nickname, role: user.role, score: user.score };
        res.redirect("/");
    });
});

// GET /logout
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

// ════════════════════════════════════════════════════
//  HOME — แสดงบทเรียนทั้งหมด
// ════════════════════════════════════════════════════
app.get("/", (req, res) => {
    const query = `
        SELECT l.*, u.nickname AS author,
            (SELECT COUNT(*) FROM lesson_contents WHERE lesson_id = l.id) AS content_count
        FROM lessons l
        LEFT JOIN users u ON l.created_by = u.id
        ORDER BY l.created_at DESC`;

    db.all(query, (err, rows) => {
        if (err) console.log(err.message);
        res.render("home", { lessons: rows || [] });
    });
});

// ════════════════════════════════════════════════════
//  SEARCH — UC-4
// ════════════════════════════════════════════════════
app.get("/search", (req, res) => {
    const keyword = (req.query.q || "").trim();

    if (!keyword) {
        return res.render("search", { lessons: [], keyword: "", notFound: false });
    }

    const like  = `%${keyword}%`;
    const query = `
        SELECT l.*,
            (SELECT COUNT(*) FROM lesson_contents WHERE lesson_id = l.id) AS content_count
        FROM lessons l
        WHERE l.title LIKE ? OR l.description LIKE ? OR l.category LIKE ?
        ORDER BY l.created_at DESC`;

    db.all(query, [like, like, like], (err, rows) => {
        if (err) console.log(err.message);
        res.render("search", {
            lessons:  rows || [],
            keyword,
            notFound: !rows || rows.length === 0
        });
    });
});

// ════════════════════════════════════════════════════
//  LESSON DETAIL — ดูรายละเอียด + เนื้อหา
// ════════════════════════════════════════════════════
app.get("/lessons/:id", (req, res) => {
    const lessonId = req.params.id;
    const userId   = req.session.user ? req.session.user.id : null;
    const msg      = req.query.msg || null;

    db.get(
        `SELECT l.*, u.nickname AS author FROM lessons l LEFT JOIN users u ON l.created_by = u.id WHERE l.id = ?`,
        [lessonId],
        (err, lesson) => {
            if (err || !lesson) return res.redirect("/");

            db.all(
                "SELECT * FROM lesson_contents WHERE lesson_id = ? ORDER BY order_num",
                [lessonId],
                (err, contents) => {
                    if (!userId) {
                        return res.render("lesson", { lesson, contents: contents || [], inLibrary: false, completedIds: [], msg });
                    }

                    db.get(
                        "SELECT id FROM user_library WHERE user_id = ? AND lesson_id = ?",
                        [userId, lessonId],
                        (err, libRow) => {
                            db.all(
                                "SELECT content_id FROM user_progress WHERE user_id = ? AND lesson_id = ? AND completed = 1",
                                [userId, lessonId],
                                (err, progRows) => {
                                    const completedIds = (progRows || []).map(r => r.content_id);
                                    res.render("lesson", { lesson, contents: contents || [], inLibrary: !!libRow, completedIds, msg });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// ════════════════════════════════════════════════════
//  LIBRARY — UC-5, 6, 7
// ════════════════════════════════════════════════════

// GET /library — UC-5: เรียกดูคลังส่วนตัว
app.get("/library", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const query  = `
        SELECT l.*,
            (SELECT COUNT(*) FROM lesson_contents WHERE lesson_id = l.id) AS content_count,
            (SELECT COUNT(*) FROM user_progress   WHERE user_id = ? AND lesson_id = l.id AND completed = 1) AS done
        FROM user_library ul
        JOIN lessons l ON ul.lesson_id = l.id
        WHERE ul.user_id = ?
        ORDER BY ul.added_at DESC`;

    db.all(query, [userId, userId], (err, rows) => {
        if (err) console.log(err.message);
        res.render("library", { lessons: rows || [], empty: !rows || rows.length === 0 });
    });
});

// POST /library/add/:lessonId — UC-6
app.post("/library/add/:lessonId", requireLogin, (req, res) => {
    const userId   = req.session.user.id;
    const lessonId = req.params.lessonId;

    db.get("SELECT id FROM user_library WHERE user_id = ? AND lesson_id = ?", [userId, lessonId], (err, row) => {
        if (row) {
            return res.redirect(`/lessons/${lessonId}?msg=already`);
        }
        db.run("INSERT INTO user_library (user_id, lesson_id) VALUES (?, ?)", [userId, lessonId], () => {
            db.run("UPDATE users SET score = score + 50 WHERE id = ?", [userId], () => {
                req.session.user.score += 50;
                res.redirect(`/lessons/${lessonId}?msg=added`);
            });
        });
    });
});

// POST /library/remove/:lessonId — UC-7
app.post("/library/remove/:lessonId", requireLogin, (req, res) => {
    const userId   = req.session.user.id;
    const lessonId = req.params.lessonId;

    db.run("DELETE FROM user_library WHERE user_id = ? AND lesson_id = ?", [userId, lessonId], () => {
        res.redirect(`/lessons/${lessonId}?msg=removed`);
    });
});

// ════════════════════════════════════════════════════
//  PROGRESS — UC-8
// ════════════════════════════════════════════════════

// GET /progress — ดูความก้าวหน้า
app.get("/progress", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const query  = `
        SELECT l.id, l.title, l.category,
            (SELECT COUNT(*) FROM lesson_contents WHERE lesson_id = l.id) AS total,
            (SELECT COUNT(*) FROM user_progress   WHERE user_id = ? AND lesson_id = l.id AND completed = 1) AS done
        FROM user_library ul
        JOIN lessons l ON ul.lesson_id = l.id
        WHERE ul.user_id = ?`;

    db.all(query, [userId, userId], (err, rows) => {
        if (err) console.log(err.message);
        res.render("progress", { lessons: rows || [], empty: !rows || rows.length === 0 });
    });
});

// POST /progress/complete/:contentId — บันทึก content เสร็จ
app.post("/progress/complete/:contentId", requireLogin, (req, res) => {
    const userId    = req.session.user.id;
    const contentId = req.params.contentId;

    db.get("SELECT lesson_id FROM lesson_contents WHERE id = ?", [contentId], (err, content) => {
        if (err || !content) return res.redirect("/progress");
        const lessonId = content.lesson_id;

        db.get("SELECT id FROM user_progress WHERE user_id = ? AND content_id = ?", [userId, contentId], (err, row) => {
            if (!row) {
                db.run(
                    "INSERT INTO user_progress (user_id, lesson_id, content_id, completed) VALUES (?, ?, ?, 1)",
                    [userId, lessonId, contentId],
                    () => {
                        db.run("UPDATE users SET score = score + 20 WHERE id = ?", [userId], () => {
                            req.session.user.score += 20;
                            res.redirect(`/lessons/${lessonId}?msg=completed`);
                        });
                    }
                );
            } else {
                res.redirect(`/lessons/${lessonId}`);
            }
        });
    });
});

// ════════════════════════════════════════════════════
//  LEADERBOARD — UC-9
// ════════════════════════════════════════════════════
app.get("/leaderboard", (req, res) => {
    const query = `
        SELECT id, nickname, username, score,
            (SELECT COUNT(*) FROM user_library WHERE user_id = users.id) AS lessons_count
        FROM users
        WHERE role = 'student'
        ORDER BY score DESC
        LIMIT 20`;

    db.all(query, (err, rows) => {
        if (err) console.log(err.message);
        res.render("leaderboard", { board: rows || [], empty: !rows || rows.length === 0 });
    });
});

// ════════════════════════════════════════════════════
//  PROFILE — UC-3
// ════════════════════════════════════════════════════

// GET /profile
app.get("/profile", requireLogin, (req, res) => {
    db.get("SELECT id, username, email, nickname, role, score FROM users WHERE id = ?", [req.session.user.id], (err, user) => {
        if (err) console.log(err.message);
        res.render("profile", { userData: user, error: null, success: null });
    });
});

// POST /profile
app.post("/profile", requireLogin, (req, res) => {
    const { nickname } = req.body;

    if (!nickname || nickname.trim() === "") {
        db.get("SELECT * FROM users WHERE id = ?", [req.session.user.id], (err, user) => {
            res.render("profile", { userData: user, error: "ข้อมูลใหม่ไม่ตรงตามเงื่อนไข", success: null });
        });
        return;
    }

    db.run("UPDATE users SET nickname = ? WHERE id = ?", [nickname.trim(), req.session.user.id], () => {
        req.session.user.nickname = nickname.trim();
        db.get("SELECT * FROM users WHERE id = ?", [req.session.user.id], (err, user) => {
            res.render("profile", { userData: user, error: null, success: "บันทึกข้อมูลเรียบร้อยแล้ว" });
        });
    });
});

// ════════════════════════════════════════════════════
//  Instructor — UC-1, UC-2
// ════════════════════════════════════════════════════

// GET /admin — แสดงบทเรียนทั้งหมด
app.get("/admin", requireAdmin, (req, res) => {
    const query = `
        SELECT l.*,
            (SELECT COUNT(*) FROM lesson_contents WHERE lesson_id = l.id) AS content_count
        FROM lessons l
        ORDER BY l.created_at DESC`;

    db.all(query, (err, rows) => {
        if (err) console.log(err.message);
        res.render("admin", { lessons: rows || [], msg: req.query.msg || null });
    });
});

// GET /admin/add — ฟอร์มเพิ่มบทเรียน
app.get("/admin/add", requireAdmin, (req, res) => {
    res.render("admin_form", { lesson: null, error: null });
});

// POST /admin/add — UC-1: เพิ่มบทเรียน
app.post("/admin/add", requireAdmin, (req, res) => {
    const { title, description, category } = req.body;

    if (!title || !description) {
        return res.render("admin_form", { lesson: null, error: "ข้อมูลที่ต้องการยังไม่ครบถ้วน" });
    }

    db.run(
        "INSERT INTO lessons (title, description, category, created_by) VALUES (?, ?, ?, ?)",
        [title, description, category || "ทั่วไป", req.session.user.id],
        () => res.redirect("/admin?msg=added")
    );
});

// GET /admin/edit/:id — ฟอร์มแก้ไขบทเรียน
app.get("/admin/edit/:id", requireAdmin, (req, res) => {
    db.get("SELECT * FROM lessons WHERE id = ?", [req.params.id], (err, lesson) => {
        if (err || !lesson) return res.redirect("/admin");
        res.render("admin_form", { lesson, error: null });
    });
});

// POST /admin/edit/:id — UC-2: แก้ไขบทเรียน
app.post("/admin/edit/:id", requireAdmin, (req, res) => {
    const { title, description, category } = req.body;

    if (!title || !description) {
        db.get("SELECT * FROM lessons WHERE id = ?", [req.params.id], (err, lesson) => {
            res.render("admin_form", { lesson, error: "ข้อมูลที่ต้องการยังไม่ครบถ้วน" });
        });
        return;
    }

    db.run(
        "UPDATE lessons SET title = ?, description = ?, category = ? WHERE id = ?",
        [title, description, category, req.params.id],
        () => res.redirect("/admin?msg=edited")
    );
});

// POST /admin/delete/:id — UC-2: ลบบทเรียน
app.post("/admin/delete/:id", requireAdmin, (req, res) => {
    db.run("DELETE FROM lesson_contents WHERE lesson_id = ?", [req.params.id], () => {
        db.run("DELETE FROM lessons WHERE id = ?", [req.params.id], () => {
            res.redirect("/admin?msg=deleted");
        });
    });
});

// GET /admin/lesson/:id/contents — จัดการเนื้อหาในบทเรียน
app.get("/admin/lesson/:id/contents", requireAdmin, (req, res) => {
    db.get("SELECT * FROM lessons WHERE id = ?", [req.params.id], (err, lesson) => {
        if (err || !lesson) return res.redirect("/admin");
        db.all("SELECT * FROM lesson_contents WHERE lesson_id = ? ORDER BY order_num", [req.params.id], (err, rows) => {
            res.render("admin_contents", { lesson, contents: rows || [], msg: req.query.msg || null });
        });
    });
});

// POST /admin/lesson/:id/contents/add — เพิ่มเนื้อหา UC-1
app.post("/admin/lesson/:id/contents/add", requireAdmin, (req, res) => {
    const { title, body, order_num } = req.body;

    if (!title) {
        return res.redirect(`/admin/lesson/${req.params.id}/contents?msg=error`);
    }

    db.run(
        "INSERT INTO lesson_contents (lesson_id, title, body, order_num) VALUES (?, ?, ?, ?)",
        [req.params.id, title, body || "", order_num || 0],
        () => res.redirect(`/admin/lesson/${req.params.id}/contents?msg=added`)
    );
});

// POST /admin/contents/delete/:contentId — ลบเนื้อหา
app.post("/admin/contents/delete/:contentId", requireAdmin, (req, res) => {
    db.get("SELECT lesson_id FROM lesson_contents WHERE id = ?", [req.params.contentId], (err, row) => {
        const lessonId = row ? row.lesson_id : null;
        db.run("DELETE FROM lesson_contents WHERE id = ?", [req.params.contentId], () => {
            res.redirect(`/admin/lesson/${lessonId}/contents?msg=deleted`);
        });
    });
});

// ── Start Server ─────────────────────────────────────
app.listen(port, () => {
    console.log(`🚀 Server started at http://localhost:${port}`);
    console.log(`\n📌 Demo accounts:`);
    console.log(`   Admin   : admin@lms.com / admin123`);
    console.log(`   Student : student1@lms.com / student123`);
});
