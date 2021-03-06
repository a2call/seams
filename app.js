var express = require('express'),
  cors = require('cors'),
  multer = require('multer'),
  compression = require('compression'),
  cfenv = require('cfenv'),
  appEnv = cfenv.getAppEnv(),
  app = express(),
  dbimport = require('./lib/import.js'),
  db = require('./lib/db.js'),
  proxy = require('./lib/proxy.js'),
  path = require('path'),
  cache = require('./lib/cache.js'),
  schema = require('./lib/schema.js'),
  isloggedin = require('./lib/isloggedin.js'),
  inference = require('./lib/inference.js');


// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// multi-part uploads 
var multipart = multer({ dest: process.env.TMPDIR, limits: { files: 1, fileSize: 100000000 }});

// posted body parser
var bodyParser = require('body-parser')({extended:true})

// compress all requests
app.use(compression());

// set up the Cloudant proxy
app.use(proxy());

// home
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});


// admin home
app.get('/admin/home', isloggedin(), function (req, res) {
  res.sendFile(path.join(__dirname,'views','adminhome.html'));
});

// admin delete
app.get('/admin/delete', isloggedin(), function (req, res) {
  res.sendFile(path.join(__dirname,'views','admindelete.html'));
});

// admin upload
app.get('/admin/upload', isloggedin(), function (req, res) {
  res.sendFile(path.join(__dirname,'views','adminupload.html'));
});

// admin search
app.get('/admin/search', isloggedin(), function (req, res) {
  res.sendFile(path.join(__dirname,'views','adminsearch.html'));
});

// search api 
app.get('/search', cors(), isloggedin(), function (req, res) {
  db.search(req.query, function(err, data) {
    if (err) {
      return res.status(err.statusCode).send({error: err.error, reason: err.reason});
    }
    res.send(data);
  });
});

// upload  CSV
app.post('/upload', isloggedin(),  multipart, function(req, res){
  var obj = {
    files: req.files,
    body: req.body,
  };
  cache.put(obj.files.file.name, obj, function(err, data) {
    inference.infer(obj.files.file.path, function(err, data) {
      data.upload_id = req.files.file.name;
      res.send(data);
    });
  });
});

// import previously uploaded CSV
app.post('/import', isloggedin(), bodyParser, function(req, res){
  console.log("****",req.body.schema);
  console.log("****");
  cache.get(req.body.upload_id, function(err, d) {
    console.log(err,d);
    if(err) {
      return res.status(404).end();
    }
    var currentUpload = d;
    
    // run this in parallel to save time
    var theschema = JSON.parse(req.body.schema);
    schema.save(theschema, function(err, d) {
      console.log("schema saved",err,d);
      // import the data
      dbimport.file(currentUpload.files.file.path, theschema, function(err, d) {
        console.log("data imported",err,d);
        cache.clearAll();
      });
    });
    
    res.status(204).end();
  });
});

app.get('/import/status', isloggedin(), function(req, res) {
  var status = dbimport.status();
  res.send(status);
});

app.post('/deleteeverything', isloggedin(), function(req, res) {
  db.deleteAndCreate(function(err, data) {
    res.send(data);
  });
});

app.get('/preview', isloggedin(), function(req, res) {
  db.preview(function(err, data) {
    res.send(data);
  });
});


// start server on the specified port and binding host
app.listen(appEnv.port, appEnv.bind, function() {

	// print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
