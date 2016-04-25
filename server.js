var dgram = require('dgram');
var server = dgram.createSocket({type:'udp4'});
var async = require('async');
var nodemailer = require('nodemailer');
var config = require('./config');
var sgTransport = require('nodemailer-sendgrid-transport');
var QRS = require('qrs');
var fs = require('fs');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var swig = require('swig');
var cons = require('consolidate');
var Datastore = require('nedb');

var NotificationsDB = new Datastore({
  filename: 'data/notifications.db',
  autoload: true
});
NotificationsDB.loadDatabase(function(err) { // Callback is optional
  console.log('*** Notifications db is loaded');
});

app.use(bodyParser.json());
app.engine('html', cons.swig);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.use(express.static('public'));
app.use(morgan('tiny'));


var PORT = config.main.portudp;

var QRS_config = {
    authentication: 'certificates',
    host: 'instance-2',
    useSSL: true,
    cert: 'C:\\CertStore\\instance-2\\client.pem',
    key: 'C:\\CertStore\\instance-2\\client_key.pem',
    ca: 'C:\\CertStore\\instance-2\\root.pem',
    port: 4242,
    headerKey: 'X-Qlik-User',
    headerValue: 'UserDirectory=Internal; UserId=sa_repository'
};

var qrs = new QRS( QRS_config );

server.on('listening', function () {
    var address = server.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

qrs.request( 'GET', 'qrs/Task/full', null, null)
   .then( function( data ) {
     //console.log(data)
   });

server.on('message', function (message, remote) {
    message = message.toString();
    var comps = message.split(';');

    if(comps[1].indexOf('Task finished with state') > -1 ) {
      var task = comps[3].split('|');
      var taskId = comps[2].split('|');
      var status = comps[1].replace('Task finished with state Finished', '')

      var recepients = 'stefan.stoichev@gmail.com';
      var mailSubject = status +': Task "'+task[0]+'"';
      var mailBody = 'Task "'+ task[0] +'" for document "'+ task[1] +'" finished with status: ' + status ;
      var mailAttachments;
      var taskName;
      var lastExecutionResult;

      qrs.request( 'GET', 'qrs/Task/full?filter=id+eq+' + taskId[0], null, null)
         .then( function( data ) {
                  var fileReferenceId = data[0].operational.lastExecutionResult.fileReferenceID;
                  taskName = data[0].name;
                  lastExecutionResult = data[0].operational.lastExecutionResult.id;

                  qrs.request( 'GET', '/qrs/ReloadTask/' + data[0].id + '/scriptlog?fileReferenceId=' + fileReferenceId, null, null)
                     .then( function( data ) {
                              qrs.request( 'GET', 'qrs/download/reloadtask/' + data.value + '/' + taskName + '.log', null, null)
                                 .then( function( script ) {
                                            SendMail( recepients, mailSubject, mailBody, script, lastExecutionResult );
                                      }, function ( err ) {
                                          console.error( 'An error occurred: ', err);
                                      });
                          }, function ( err ) {
                              console.error( 'An error occurred: ', err);
                          });
              }, function ( err ) {
                  console.error( 'An error occurred: ', err);
              });
    }
});

server.bind(PORT, 'localhost');

function SendMail(recepients, mailSubject, mailBody, mailAttachments, filename) {
  // console.log(recepients)
  // console.log(mailSubject)
  // console.log(mailBody)
   //console.log(mailAttachments)
   //console.log(filename)

// var attachments = [];
//   //if (config.mail.includefailscript == true) {
//     if (mailAttachments.length > 0) {
//       attachments.push({
//         filename: filename + '.log',
//         content: mailAttachments
//       });
//     }
//   //}

  var transporter = nodemailer.createTransport({
    host: config.mail.host,
    secureConnection: config.mail.ssl,
    port: config.mail.port,
    auth: {
      user: config.mail.user,
      pass: config.mail.pass
    },
    tls: {
      ciphers: config.mail.tls
    }
  }, {
    from: config.mail.from,
    headers: {
      'My-Awesome-Header': '123'
    },
    attachments: [{
      filename: filename + '.txt',
      content: mailAttachments,
      contentType: 'text/plain'
    }]
  });

  transporter.sendMail({
    to: recepients,
    subject: mailSubject,
    html: mailBody
  }, function(err, data) {
    if (err) {
      console.log(err)
    }
    console.log(data)

  });
}
