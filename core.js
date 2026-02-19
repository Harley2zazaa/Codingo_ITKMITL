///// Set up Section

const express = require("express");
const path = require("path");
const port = 3000;
// Req. sqlite
const sqlite3 = require('sqlite3').verbose();
// Creating the Express server
const app = express();
// static resourse & templating engine
app.use(express.static('public'));
// Set EJS as templating engine
app.set('view engine', 'ejs');

///// Path Section

app.get('/', function (req, res) {
    res.send("Test Server")
});




///// Check Open Server
app.listen(port, () => {
   console.log("Server started.");
 });