const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();

// Render provides PORT automatically.
// Local computer will use port 3000.
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || "hemora-local-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

// Serve frontend
app.use(express.static("public"));

/* =========================
   HOME PAGE
========================= */

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

/* =========================
   REGISTER USER
========================= */

app.post("/api/register", async (req, res) => {
    try {
        const {
            name,
            username,
            email,
            password,
            role
        } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields."
            });
        }

        const [existing] = await db.promise().query(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Username or email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.promise().query(
            `INSERT INTO users
            (name, username, email, password, role)
            VALUES (?, ?, ?, ?, ?)`,
            [
                name,
                username,
                email,
                hashedPassword,
                role || "user"
            ]
        );

        res.json({
            success: true,
            message: "Registration successful!",
            userId: result.insertId
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
    try {
        const {
            username,
            password
        } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Please enter username and password."
            });
        }

        const [users] = await db.promise().query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const user = users[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role
        };

        res.json({
            success: true,
            message: "Login successful!",
            user: req.session.user
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/user", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please login first."
        });
    }

    res.json({
        success: true,
        user: req.session.user
    });
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Logout failed."
            });
        }

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

/* =========================
   BLOOD STOCK
========================= */

app.get("/api/blood-stock", async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            "SELECT * FROM blood_stock ORDER BY blood_group"
        );

        res.json({
            success: true,
            stock: rows
        });

    } catch (error) {
        console.error("BLOOD STOCK ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load blood stock."
        });
    }
});

/* =========================
   REQUEST BLOOD
========================= */

app.post("/api/request-blood", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login first."
            });
        }

        const {
            patient_name,
            blood_group,
            units,
            hospital,
            contact
        } = req.body;

        if (!patient_name || !blood_group || !units) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields."
            });
        }

        const [result] = await db.promise().query(
            `INSERT INTO blood_requests
            (
                user_id,
                patient_name,
                blood_group,
                units,
                hospital,
                contact
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.session.user.id,
                patient_name,
                blood_group,
                units,
                hospital,
                contact
            ]
        );

        res.json({
            success: true,
            message: "Blood request submitted successfully!",
            requestId: result.insertId
        });

    } catch (error) {
        console.error("REQUEST BLOOD ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Blood request failed."
        });
    }
});

/* =========================
   REQUEST HISTORY
========================= */

app.get("/api/history", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login first."
            });
        }

        const [rows] = await db.promise().query(
            `SELECT *
             FROM blood_requests
             WHERE user_id = ?
             ORDER BY request_date DESC`,
            [req.session.user.id]
        );

        res.json({
            success: true,
            requests: rows
        });

    } catch (error) {
        console.error("HISTORY ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load request history."
        });
    }
});

/* =========================
   DONOR REGISTRATION
========================= */

app.post("/api/donors", async (req, res) => {
    console.log("🩸 DONOR REGISTRATION RECEIVED");
    console.log("Donor data:", req.body);

    try {
        const {
            name,
            age,
            gender,
            blood_group,
            phone,
            email,
            address,
            username,
            password
        } = req.body;

        if (!name || !age || !blood_group || !username || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields."
            });
        }

        const [existing] = await db.promise().query(
            "SELECT id FROM donors WHERE username = ?",
            [username]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Donor username already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.promise().query(
            `INSERT INTO donors
            (
                name,
                age,
                gender,
                blood_group,
                phone,
                email,
                address,
                username,
                password
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                age,
                gender,
                blood_group,
                phone,
                email,
                address,
                username,
                hashedPassword
            ]
        );

        console.log("✅ Donor saved successfully!");
        console.log("Donor ID:", result.insertId);

        res.json({
            success: true,
            message: "Donor registration successful!",
            donorId: result.insertId
        });

    } catch (error) {
        console.error("❌ DONOR REGISTRATION ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Donor registration failed."
        });
    }
});

/* =========================
   GET ALL DONORS
========================= */

app.get("/api/donors", async (req, res) => {
    console.log("📋 Loading donor list...");

    try {
        const [rows] = await db.promise().query(
            `SELECT
                id,
                name,
                age,
                gender,
                blood_group,
                phone,
                email,
                address,
                username,
                created_at
             FROM donors
             ORDER BY id ASC`
        );

        console.log("✅ Donors found:", rows.length);

        res.json({
            success: true,
            donors: rows
        });

    } catch (error) {
        console.error("❌ GET DONORS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load donors."
        });
    }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
    console.log("");
    console.log("=================================");
    console.log("❤️ Hemora server is running!");
    console.log(`🌐 Port: ${PORT}`);
    console.log("=================================");
    console.log("");
});
