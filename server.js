var net = require('net');
var http = require('http');
var fs = require('fs');
var aws = require("aws-sdk");

var pot_listen = 'localhost';
var pot_port = 23;
var pot_log_port = 8080;
var pot_message = "\nHi there! You should hack me.\n-------------------------------------------------------------------------\n\nlogin:";

aws.config.update({accessKeyId: "", secretAccessKey: ""});
var s3 = new aws.S3();
var S3_BUCKET = "atlantic-state-results";

var hackAttempts = []


console.log("Listening for hackers!")
var server = net.createServer(function(socket){

  // Initialize per-connection username and password
  var username, password;

  socket.setEncoding('utf8');
  console.log("connected with " + socket.remoteAddress);
  socket.write(pot_message);

  socket.on("error", function(err){
     console.log("error: " + err);
  });

  socket.on("data", function(data){
    data = data.toString().trim();

    // Check if this is the introductory telnet data stream, which I'll ignore
    if( data.indexOf("\x05") != -1 ){
      return;
    }

    // If the user doesn't enter a username, re-print "login"
    if ( typeof username == "undefined" ){
      if (!data) {
        socket.write("login: ");
        return;
      }
      // Otherwise, store username and ask for password
      username = data;
      socket.write("password: ");
    }
    else if( username && !password ){
      // Oho! They've supplied a username and password. Let's now give them a fake shell prompt
      password = data.toString().trim();
      socket.write(username + "@server:# ");
    }
    else if( username && password ) {
      // Now they've entered a command; let's log it
      var command = data.toString().trim();
      var message = "\"" + new Date() + "\",\"" + username + "\",\"" + password + "\",\"" + command + "\"," + socket.remoteAddress;
      fs.appendFileSync("logs.txt", message + "\n")
      console.log(message);

      // Add IP address to the list of unique IPs that have attempted logins
      var collectedIPs = hackAttempts.map(function(d){ return d.ip });
      if( collectedIPs.indexOf(socket.remoteAddress) == -1 ){
        hackAttempts.push({ date: new Date(), username: username, password: password, ip: socket.remoteAddress });
        // Push this file to S3
        s3.putObject({
        	Bucket: S3_BUCKET,
        	Key: "hacker-logs.json",
        	Body: JSON.stringify(hackAttempts) || "no data",
        	ACL: "public-read"
        }, function(err, data){
        	if(err) console.log(err);
          console.log("sent data")
        });

      }
      socket.end();
    }
  });

});

server.listen(pot_port, pot_listen, () => {
  console.log('Pot Server Started on', server.address());
});


// Simple HTTP server to output the ongoing logs.txt file
var logserver = http.createServer(function(request, response){
  var csv = fs.readFileSync("logs.txt");
  response.write(csv);
  response.end();
});

logserver.listen(pot_log_port, pot_listen, () => {
  console.log('Pot Log Server Started on', logserver.address());
});
