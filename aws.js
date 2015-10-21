var AWS = require('aws-sdk');
var EventEmitter = require("events").EventEmitter;
var fs = require('fs');

var credentials = new AWS.SharedIniFileCredentials({profile: 'personal'});
AWS.config.credentials = credentials;

function main(ee) {
  var s3 = new AWS.S3();
  var ee = new EventEmitter();
  var folder = '';
  var bucket = '';

  ee.on('init', function() {
    fileSystemActual.readDir(ee, folder);
    //s3Actual.listBuckets(s3, ee);
    //s3Actual.listObjects(s3, ee, bucket)
  });

  ee.on('log', function(log) {console.log(log);});

  ee.on('MFSDirectory', function(dir) {
    ee.emit('begin-upload', dir);
  });

  ee.on('begin-upload', function(dir) {
    var currentIndex = 0;
    var currentFile = null;

    ee.on('next-file', function() {
      console.log(currentIndex);
      fileSystemActual.readFile(ee, dir.getPathAtIndex(currentIndex), dir.files[currentIndex]);
    }); 

    ee.on('MFSFile', function(file) {
      currentFile = file;
      s3Actual.uploadObject(s3, ee, currentFile.path, currentFile.buffer);
    });

    ee.on('s3-upload-success', function() {
      console.log('upload success');
      currentIndex += 1;
      if (currentIndex === dir.files.length) {
        console.log('upload complete');
      }
      else {
        ee.emit('next-file') 
      }
    });

    ee.on('s3-upload-error', function() {
      console.log('upload error');
      s3Actual.uploadObject(s3, ee, currentFile.path, currentFile.buffer);
    })

    ee.emit('next-file');
  });

  ee.on('buckets-list', function(data) {
    console.log(data);
    s3Actual.listObjects(s3, ee, 'infinite-scroll');
  });

  ee.on('bucket-objects', function(data) { console.log(data); });

  ee.emit('init');
}

/* s3 interactions */
var s3Actual = {
  listBuckets: function(s3, ee) {
    s3.listBuckets(function(err, data) {
      if (err) { 
        console.log(err, err.stack());
        return;
      }
      ee.emit('buckets-list', data);
    });
  },

  listObjects: function(s3, ee, bucketName) {
    var params = {
      Bucket: bucketName
    };
    s3.listObjects(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
        return;
      }
      ee.emit('bucket-objects', data);
    });
  },

  uploadObject: (function(){
    var factor = new FailFactor();
    return function(s3, ee, key, data) {
      var params = {Bucket: 'infinite-scroll', Key: key, Body: data};
      
      setTimeout(function() {
        s3.upload(params, function(err, data) {
          if (err) {
            factor.fail();
            ee.emit('s3-upload-error', ee, err);
            return;
          }

          factor.succeed();
          ee.emit('s3-upload-success', ee);
        });
      }, factor.getFactor() * 1 );
    }
  })()
}

var fileSystemActual = {
  'readDir': function(ee, path) {
    fs.readdir(path, function(err, files) {
      if (err) { 
        console.log(err);
        return;
      }
      ee.emit('log', files.length + ' files found in ' + path);
      var dir = new MFSDirectory(path, files);
      ee.emit(dir.type, dir);
    });
  },

  'readFile': function(ee, path, fileName) {
    fs.readFile(path, function (err, data) {
      if (err) { 
        console.log(err);
        return;
      }
      var file = new MFSFile(fileName, path, data);
      ee.emit(file.type, file)
    });
  }
}

function MFSDirectory(path, files) {
  this.type = 'MFSDirectory';
  this.path = path;
  this.files = files;

  this.getPathAtIndex = function(i) {
    return this.path + '/' + this.files[i];
  }
}

function MFSFile(fileName, path, buffer) {
  this.type = 'MFSFile';
  this.fileName;
  this.path = path;
  this.buffer = buffer;
}

function FailFactor() {
  this.factor = 0;

  this.succeed = function() {
    if (this.factor > 0) { this.factor -= 1 }
  }
  this.fail = function() { this.factor += 1 }

  this.getFactor = function() { return this.factor; }
}

main();