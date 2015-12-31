var Twilio = Meteor.npmRequire('twilio');
var fs = Meteor.npmRequire('fs');
var net = Meteor.npmRequire('net');
var gcm = Meteor.npmRequire('node-gcm');
var PushBullet = Meteor.npmRequire('pushbullet');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_pings = {'SF': (new Date()).getTime(), 'Caltrain': (new Date()).getTime(), 'Other': (new Date()).getTime()};
var MICRO_PHONES = {'Caltrain': '+16504417308', 'SF': '+16505465336'};
var active_phones = ['SF', 'Caltrain', 'Other'];
var MICRO_PHONES_INVERSE = invert(MICRO_PHONES);
var MICRO_PHONE_IMEIS = {'5218': 'Caltrain', '0630': 'SF'};
var PHONE_IDS = {'b1e01101f4a907fd': 'SF', 'd8c62546300cdda1': 'Caltrain', 'noalso': 'Other'}; // TODO actual id
var WATCHDOG_TIMEOUT = 1800000;
var pusher = new PushBullet('oYHlSULc3i998hvbuVtsjlH0ps23l7y2');
var phone_action_map = {
  'lock':   '+15126435858',
  'unlock': '+15126435681',
  'bat':    '+15126435786',
  'stream_gps':    '+15128722240',
  'siren_1sec':    '+15126436369',
};

function log() {
  arguments[0] = '[' + new Date().toISOString() + '] ' + arguments[0];
  console.log.apply(this, arguments);
}

var sendAndroidMessage = function(msg, micro_name) {
    var regid = Regid.findOne({micro_name: micro_name});
    if (!regid) {
        console.error("Nothing registered");
        return;
    }

    var message = new gcm.Message({
        data: {
            method: 'speak',
            text: msg
        }
    });

    // Set up the sender with you API key 
    var sender = new gcm.Sender('AIzaSyA7KXZIY6hc39WAxvPO1ednt1HmtSSrWOU');

    // Add the registration IDs of the devices you want to send to 
    var registrationIds = [regid.regid];

    sender.send(message, registrationIds, 5, function(err, result) {
      if(err) console.error(err);
      else    log(result);
    });
}

Meteor.startup(function () {
    log('start up');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
    StateMap.upsert({key: 'frame_count', micro_name: 'Caltrain'}, {$set: {val: 0}});
});

Router.route('/regid/:phone_id/:regid', {where: 'server'})
    .post(function () {
        if (!this.params.regid || this.params.regid.length === 0) { // TODO temporary, for my not-updated android phone
          return;
        }
        var micro_name = 'Caltrain';
        if (PHONE_IDS[this.params.phone_id]) {
          micro_name = PHONE_IDS[this.params.phone_id];
        }

        Regid.upsert({micro_name: micro_name}, {$set: {regid: this.params.regid}});
        log('regid is', this.params.regid, 'phone_id is', this.params.phone_id, 'micro_name is', micro_name);
        this.response.end('done');
    });

Meteor.publish('coords', function(num) {
    Counts.publish(this, 'countCoords', Coords.find(), { noReady: true });
    return Coords.find({}, {'sort': ['createdAt'], skip: num, limit: 1});
});

Meteor.publish('arduino_coords', function() {
    // TODO change
    return Coords.find({from_arduino: true}, {'sort': {'createdAt': -1}, limit: 10});
});

Meteor.publish('state', function() {
  return StateMap.find({});
});

var sendSMS = function(number, msg) {
    client.sendMessage({
      to: number,
      from: '+15128722240',
      body: msg
    }, function (err, res) {
      log('err', err);
      log('res', res);
    });
};


var sendPushbullet = function(title, msg, phone_nickname, cb) {
    pusher.devices(function(err, res) {
        if (err) {
            return;
        }
        var params = {};
        if (phone_nickname && phone_nickname.length > 0) {
            var bikeId;
            for (var i = 0; i < res.devices.length; i++) {
                if (res.devices[i].nickname == phone_nickname) {
                    params = {device_iden: res.devices[i].iden};
                    break;
                }
            }
        }
        pusher.note(params, title, msg, cb);
    });
};

var sendRing = function(to_number, from_number) {
  log('send ring to', from_number);
  client.calls.create({
    to: to_number,
    from: from_number,
    url: "http://gps.chaselambda.com",
    timeout: 1,
    statusCallback: "http://gps.chaselambda.com/call_completed",
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
  }, function (err, res) {
    log('err', err);
    log('res', res);
  });
};

var sendAlert = function(micro_name, msg) {
  if (active_phones.indexOf(micro_name) === -1) {
    return;
  }
  var CHASE_PHONE = '+15125778778';
  msg = (new Date()).toISOString() + ' ' + micro_name + ' Alert: ' + msg;
  sendPushbullet(msg, '', 'nexus4bike');
  sendPushbullet(msg, '', 'iphoneoliver');
  sendSMS(CHASE_PHONE, msg);
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendRing: function (action, micro_name) {
      var from_number = phone_action_map[action];
      StateMap.upsert({key: 'ringStatus', micro_name: micro_name}, {$set: {val: 'ringing'}});
      sendRing(MICRO_PHONES[micro_name], from_number);
    },
    sendAndroidMessage: sendAndroidMessage,
});


// IronRouter
Router.route('/add_coords/:lat/:long/:time', {where: 'server'})
  .post(function () {
      var coord = {
          lat: this.params.lat,
          long: this.params.long,
          createdAt: new Date(parseInt(this.params.time))
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/add_arduino/:lat/:long/:type', {where: 'server'})
  .post(function () {
      var coord = {
        lat: parseInt(this.params.lat) / 10000.0,
        long: parseInt(this.params.long) / 10000.0,
        createdAt: new Date(),
        type: this.params.type,
        from_arduino: true
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/setGlobalState/:phone_id/:key/:value?', {where: 'server'})
    .post(function () {
        if (!this.params.value || this.params.value === 0) { // TODO temporary for phone outside.. also remove ? of :value? above
          this.params.value = this.params.key;
          this.params.key = this.params.phone_id;
          this.params.phone_id = 'Caltrain';
        }
        log('setglobalstate', this.params.phone_id, this.params.key, this.params.value);
        var value = this.params.value;
        if (['cameraOn'].indexOf(this.params.key) >= 0) {
            value = this.params.value === 'true';
        }
        var micro_name = 'Caltrain';
        if (PHONE_IDS[this.params.phone_id]) {
          micro_name = PHONE_IDS[this.params.phone_id];
        }
        StateMap.upsert({key: this.params.key, micro_name: micro_name}, {$set: {val: value}});
        this.response.end('done');
    });

var handle_micro_msg = function(msg) {
  msg = msg.trim();

  var micro_name = 'Other';
  var possible_imei = MICRO_PHONE_IMEIS[msg.substr(0, 4)];
  if (possible_imei) {
    micro_name = possible_imei;
    msg = msg.substr(5);
  }
  log('handling', micro_name, msg);

  if (msg.indexOf('gps:') !== -1) {
    parts = msg.split(':');
    var coord = {
      lat: parseInt(parts[1]) / 10000.0,
      long: parseInt(parts[2]) / 10000.0,
      createdAt: new Date(),
      type: 'gps',
      from_arduino: true
    };
    log('insert', coord);
    Coords.insert(coord);
  } else if (msg.indexOf('srt:') !== -1) {
    var locked = StateMap.findOne({key: 'locked', micro_name: micro_name});
    if (locked && locked.val) {
      sendAlert(micro_name, 'arduino restarted in lock state!');
    }
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: true}});
  } else if (msg.indexOf('bat:') !== -1) {
    var parts = msg.split('bat:');
    log(parts);
    parts = parts[1].split('/');
    log(parts);
    var voltage = parseInt(parts[0]);
    var percentage = parseInt(parts[1]);
    if (voltage < 3520 && percentage < 17) {
      sendAlert(micro_name, 'undervoltage');
    }
  } else if (msg.indexOf('move_count:') !== -1) {
    sendAlert(micro_name, msg);
  } else if (msg.indexOf("Locked") !== -1) {
    log('locked', micro_name);
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: true}});
    log('stream_gps off ', micro_name);
    StateMap.upsert({key: 'stream_gps', micro_name: micro_name}, {$set: {val: false}});
  } else if (msg.indexOf("Unlocked") !== -1) {
    log('unlocked', micro_name);
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: false}});
    log('stream_gps off ', micro_name);
    StateMap.upsert({key: 'stream_gps', micro_name: micro_name}, {$set: {val: false}});
  } else if (msg.indexOf("first_move") !== -1) {
    sendAndroidMessage('bumped', micro_name);
  } else if (msg.indexOf("second_move") !== -1) {
    sendAndroidMessage('bumped', micro_name);
  }
  StateMap.upsert({key: 'lastSMS', micro_name: micro_name}, {$set: {val: msg}});
  log('update last_pings[' + micro_name + ']');
  last_pings[micro_name] = (new Date()).getTime();
   
  if (msg === 'stream_gps') {
    log('stream_gps on ', micro_name);
    StateMap.upsert({key: 'stream_gps', micro_name: micro_name}, {$set: {val: true}});
  }
};

Router.route('/sms', {where: 'server'})
  .post(function () {
      handle_micro_msg(this.request.body.Body);
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call', {where: 'server'})
  .post(function () {
      log('hit call');
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call_completed', {where: 'server'})
  .post(function () {
      var micro_name = MICRO_PHONES_INVERSE[this.request.body.To];
      log('call completed', micro_name);
      StateMap.upsert({key: 'ringStatus', micro_name: micro_name}, {$set: {val: 'completed'}});
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end();
  });

Meteor.setInterval(function() {
    Object.keys(last_pings).forEach(function (micro_name) {
      var locked = StateMap.findOne({key: 'locked', micro_name: micro_name});
      if (!locked || !locked.val) {
        return;
      }
      if (last_pings[micro_name] + WATCHDOG_TIMEOUT < (new Date()).getTime()) {
        log('watchdog too old for', micro_name + ':', last_pings[micro_name], (new Date()).getTime());
        sendAlert(micro_name, 'watchdog expired!');
        StateMap.update(locked._id, {$set: {val: false}});
      } else {
        log('interval', (new Date()).getTime() - last_pings[micro_name]);
      }
    });
}, 2000);

net.createServer(Meteor.bindEnvironment( function ( socket ) {
  socket.on("error", function(err) {
    log("Caught tcp error: ");
    log(err.stack);
    socket.destroy();
  });

  socket.addListener( "data", Meteor.bindEnvironment( function ( data ) {
        handle_micro_msg(data.toString('ascii'));
  }));
})).listen( 5000 );

var global_clients = [];

net.createServer(Meteor.bindEnvironment( function ( socket ) {
  var header = "HTTP/1.0 200 OK\r\nCache-Control: no-cache\r\nPragma: no-cache\r\nExpires: Thu, 01 Dec 1994 16:00:00 GMT\r\nConnection: close\r\nContent-Type: multipart/x-mixed-replace; boundary=--myboundary\r\n\r\n--myboundary\r\n";
  socket.on("error", function(err) {
    log("7000 tcp error: ");
    global_clients.splice(global_clients.indexOf(socket), 1);
    log(err.stack);
    socket.destroy();
  });

  socket.on('end', function() {
    var i = global_clients.indexOf(socket);
    if (i !== -1) {
      global_clients.splice(i, 1);
    }
    console.log('disconnected, global_clients left:', global_clients.length);
  });

  socket.addListener("data", Meteor.bindEnvironment(function(data) {
        console.log('got', data.toString('ascii'));
        if (data.toString('ascii').indexOf('text/html') !== -1) {
            socket.write(header);
            global_clients.push(socket); // TODO kinda race condition.. this should be locked?
            log('count', global_clients.length);
        } else if (data.toString('ascii').indexOf('Accept: image/webp') !== -1 || data.toString('ascii').indexOf('curl') !== -1) {
            socket.write(header);
            global_clients.push(socket);
            log('count', global_clients.length);

        } else {
          socket.end();
        }
  }));
})).listen( 7000 );

net.createServer(Meteor.bindEnvironment( function ( socket ) {
  log('connection on 4000');
  var recording_name = (new Date()).toISOString() + '.vid';
  socket.on('end', function () {
    console.log('streaming connection closed');
  });

  socket.on("error", function(err) {
    log("4000 tcp error: ");
    log(err.stack);
    socket.destroy();
  });

  socket.addListener( "data", Meteor.bindEnvironment( function ( data ) {
        for (var i = 0; i < global_clients.length; i++) {
          global_clients[i].write(data);
        }
        // Weird.. have to put this after "write" to stop glitchy stuff.. I'm guessing the feed goes out of order otherwise
        // could keep the file open if that's usefully faster
        fs.appendFileSync('/Users/chase/Dropbox/boosted/gps-meteor/' + recording_name, data);
  }));
})).listen( 4000 );

function invert(o) {
  var ret = {};
  Object.keys(o).forEach(function (k) {
    ret[o[k]] = k;
  });
  return ret;
}

// play back raw recording, without going frame by frame
      //var increment = 10000;
      //var interval = Meteor.setInterval(function() {
          //if (file_data.length <= loc + increment) {
            //console.log('done');
            //Meteor.clearInterval(interval);
            //socket.end();
            //return;
          //}
          //if (alive) {
            //console.log('write', loc);
            //socket.write(file_data.slice(loc, loc + increment));
            //loc += increment;
          //} else {
            //Meteor.clearInterval(interval);
            //socket.end();
            //return;
          //}
        //}, 10);
        //
        //
        //

// recording frame by frame
        //if (data.toString('ascii').indexOf('myboundary') !== -1) {
          //StateMap.upsert({key: 'frame_count', micro_name: 'Caltrain'}, {$inc: {val: 1}});
          //console.log('found');
        //}
        //if (CameraFrames.find().count() < 50) {
          //cur_frame = Buffer.concat([cur_frame, data]);
          //console.log('part of frame inserted');
          //var sr = cur_frame.toString('binary');
          //if (sr.indexOf('--myboundary') !== -1) {
            //var first = sr.substr(0, sr.indexOf('--myboundary') + '--myboundary'.length + 2);
            //var second = sr.substr(sr.indexOf('--myboundary') + '--myboundary'.length + 2);
            //if (global_frame_count > 1) {
              //CameraFrames.insert({timestamp: (new Date()).getTime(), img: first});
            //}
            //console.log('added full frame', first.length);
            //cur_frame = new Buffer(second);
            //console.log(cur_frame.slice(40, 200).toString('utf8'));
            //console.log(cur_frame.slice(40, 200));
          //}
          ////console.log(data.slice(0, 200).toString('utf8'));
          //global_frame_count += 1;
          ////console.log('insert', global_frame_count);
          ////CameraFrames.insert({timestamp: (new Date()).getTime(), img: global_frame_count});
        //}
