<p align="center">
    <img width=1000 height=auto src="/public/img/codingo_logo.png">
</p>

# Codingo

A computer programming skills learning management system for education and self-development

## Setting Up

### Install Node.js (Recommend LTS version)

**Make sure you have Node.js installed on your device**

Open your `Terminal` and run

```sh
node -v
```

Then run

```sh
npm -v
```

If it not found, visit [this link](https://nodejs.org/en/download) select your OS and download the installer

### Install package

**Make sure you have this package installed on your device**

Open your `Terminal` and run

```sh
npm install -g nodemon
```

## Download

### First method
Go to `<> Code` Drop-down and click `Download ZIP`

### Second method
Clone repository using URL

```sh
git clone https://github.com/Harley2zazaa/Codingo_ITKMITL.git
```

## Getting Start

### First method

Open your `Terminal` and go this project folder where this project file downloaded on your device

**Start local server**

```sh
nodemon index.js
```

**Open web browser, type this URL in search bar and enter**

```
http://localhost:3000
```

### Second method

Use **[run.bat](run.bat)** file for **Windows**

*"It will do every step by step. Click it and enjoy"*

## For development

***Start without node_module and .json file, follow this step***

### Initialize

run this command

```sh
npm init -y
```

### Install packages

After previous part then run

```sh
npm install nodemon express ejs sqlite3 express-session
```

## Example accounts

### Sign-in

This is mock-up data

| Role           | Duty                                                  | Username  | Email              | Password |
|:---------------|:------------------------------------------------------|:----------|:-------------------|:---------|
| **student**    | add and remove course, learning and quiz each content | `sarin`   | `sarin@mail.com`   | `cisco`  |
| **instructor** | create, edit and delete course/content                | `arjarn`  | `arjarn@mail.com`  | `class`  |
| **admin**      | edit and delete account                               | `support` | `support@mail.com` | `hello`  |

### Register

Create your own account and remember it
