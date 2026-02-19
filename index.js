const express = require("express");
const path = require("path");
const port = 3000;
const sqlite3 = require("sqlite3").verbose();
const app = express();

let db = new sqlite3.Database("", (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log("Connected to the SQlite database.");
});

app.use(express.static("public"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.send("Test Server")
});

app.listen(port, () => {
    console.log("Server started.");
});
