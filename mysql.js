// This helped me for mysql: https://markshust.com/2013/11/07/creating-nodejs-server-client-socket-io-mysql/
// This helped me for singleton: https://www.dofactory.com/javascript/singleton-design-pattern
// This helped me for hashing passwords: https://www.abeautifulsite.net/hashing-passwords-with-nodejs-and-bcrypt


const bcrypt = require('bcrypt');

const database = function() {

    var database;

    function createInstance() {

        var mysql = require('mysql');

        var db = mysql.createConnection({
            host: '3.136.160.212',
            user: 'nodeuser',
            password: 'node',
            database: 'chatroom',
            port: '3306'
        });

        db.connect(function(err){
            if (err) console.log(err)
        })

        const DAO = {}

        DAO.registerUser = function (username, password, registerResult) {
            let success = "";
            let hash = bcrypt.hashSync(password, 10)
            return db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], function (error, results, fields) {
                if (error) {
                    console.log("user not registered, error is: " + error)
                    registerResult(false, username);
                }
                console.log("user registered")
                registerResult(true, username);
            })
        }

        DAO.loginUser = function(username, password, loginResult) {
            return db.query("SELECT password FROM users WHERE username = ? ", [username], function (error, results, fields) {
                if (error) {
                    console.log(error)
                    loginResult(false, username);
                }
                if(bcrypt.compareSync(password, results[0].password)) {
                    console.log("user logged in successfully")
                    loginResult(true, username);
                } else {
                    console.log("user login failed")
                    loginResult(false, username);
                }
            })
        }
        return DAO

    }

    if (!database) {
        database = createInstance();
    }

    return database;

}

module.exports = database;