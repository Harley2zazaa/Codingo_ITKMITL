#!/bin/bash

cd "$(dirname "$0")"

lsof -ti:3000 | xargs -r kill -9

(sleep 2 && xdg-open http://localhost:3000) &

nodemon index.js || npx nodemon index.js

read -n 1 -s
