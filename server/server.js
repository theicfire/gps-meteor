var Twilio = Meteor.npmRequire('twilio');
var fs = Meteor.npmRequire('fs');
var net = Meteor.npmRequire('net');
var os = Meteor.npmRequire('os');
var gcm = Meteor.npmRequire('node-gcm');
var PushBullet = Meteor.npmRequire('pushbullet');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var MICRO_WATCHDOG_TIMEOUT = 1800000;
var PHONE_WATCHDOG_TIMEOUT = 600000;
var pusher = new PushBullet('oYHlSULc3i998hvbuVtsjlH0ps23l7y2');
var phone_action_map = {
  'lock':   '+15126435858',
  'unlock': '+15126435681',
  'bat':    '+15126435786',
  'stream_gps':    '+15128722240',
  'siren_1sec':    '+15126436369',
};
var move_alert_sent = false;
var boxes = Globals.boxes;

var box_name_from_key = function(key, val) {
  var ret = null;
  Object.keys(boxes).forEach(function (box_name) {
    if (boxes[box_name][key] === val) {
      ret = box_name;
      return;
    }
  });
  return ret;
};

var video_dir = '/Users/chase/Dropbox/boosted/gps-meteor/';
if (os.hostname() === 'boosted-gps') {
  video_dir = '/home/video_recordings/';
}

function log() {
  arguments[0] = '[' + new Date().toISOString() + '] ' + arguments[0];
  console.log.apply(this, arguments);
}

function loge() {
  arguments[0] = 'Error: ' + arguments[0];
  log.apply(this, arguments);
}

var sendAndroidMessage = function(msg, box_name) {
    if (!boxes[box_name].hasOwnProperty('phone_id')) {
      return;
    }
    log('sendAndroidMessage', msg, box_name);
    var regid = Regid.findOne({box_name: box_name});
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
      if (err) {
        loge('sendAndroidMessage', err);
      } else {
        log('sendAndroidMessage success');
      }
    });
}

Meteor.startup(function () {
    log('Meteor Starting');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
    StateMap.upsert({key: 'frame_count', box_name: 'Caltrain'}, {$set: {val: 0}});
    StateMap.update({key: 'phone_watchdog_on'}, {$set: {val: false}});
});

Router.route('/regid/:phone_id/:regid', {where: 'server'})
    .post(function () {
        if (!this.params.regid || this.params.regid.length === 0) { // TODO temporary, for my not-updated android phone
          return;
        }
        var box_name = box_name_from_key('phone_id', this.params.phone_id);
        if (!box_name) {
          loge('unknown phone_id', this.params.phone_id);
          this.response.end('Unknown phone_id\n');
          return;
        }

        Regid.upsert({box_name: box_name}, {$set: {regid: this.params.regid}});
        log('regid is', this.params.regid, 'phone_id is', this.params.phone_id, 'box_name is', box_name);
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
    log('sendSMS', number, msg);
    client.sendMessage({
      to: number,
      from: '+15128722240',
      body: msg
    }, function (err, res) {
      if (err) {
        loge('sendSMS', err);
      } else {
        log('sendSMS success');
      }
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
  client.calls.create({
    to: to_number,
    from: from_number,
    url: "http://gps.chaselambda.com",
    timeout: 1,
    statusCallback: "http://gps.chaselambda.com/call_completed",
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
  }, function (err, res) {
    if (err) {
      loge('sendRing', err, res);
    } else {
      log('sendRing success');
    }
  });
};

var sendAlert = function(box_name, msg) {
  if (!boxes[box_name].enable_alerts) {
    return;
  }
  var CHASE_PHONE = '+15125778778';
  msg = (new Date()).toISOString() + ' ' + box_name + ' Alert: ' + msg;
  log('sendAlert:', msg);
  sendPushbullet(msg, '', 'nexus4bike');
  sendPushbullet(msg, '', 'iphoneoliver');
  sendSMS(CHASE_PHONE, msg);
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendRing: function (action, box_name) {
      var from_number = phone_action_map[action];
      StateMap.upsert({key: 'ringStatus', box_name: box_name}, {$set: {val: 'ringing'}});
      log('call sendRing', box_name, action);
      sendRing(boxes[box_name].fona_number, from_number);
    },
    sendAndroidMessage: sendAndroidMessage,
    togglePhoneWatchdog: function(box_name) {
      if (!boxes[box_name].hasOwnProperty('phone_id')) {
        StateMap.upsert({key: 'phone_watchdog_on', box_name: box_name}, {$set: {val: false}});
        return;
      }
      var on = StateMap.findOne({key: 'phone_watchdog_on', box_name: box_name});
      StateMap.upsert({key: 'phone_watchdog_on', box_name: box_name}, {$set: {val: !on || !on.val}});
      boxes[box_name].phone_last_ping = 0;
    },
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

Router.route('/setGlobalState/:phone_id/:key/:value', {where: 'server'})
    .post(function () {
        log('setglobalstate', this.params.phone_id, this.params.key, this.params.value);
        var value = this.params.value;
        if (['cameraOn'].indexOf(this.params.key) >= 0) {
            value = this.params.value === 'true';
        }
        var box_name = box_name_from_key('phone_id', this.params.phone_id);
        if (!box_name) {
          loge('unknown phone_id', this.params.phone_id);
          this.response.end('Unknown phone_id\n');
          return;
        }
        StateMap.upsert({key: this.params.key, box_name: box_name}, {$set: {val: value}});
        if (this.params.key === 'bat') {
          boxes[box_name].phone_last_ping = (new Date()).getTime();
        }
        this.response.end('done');
    });

var handle_micro_msg = function(msg) {
  msg = msg.trim();

  var box_name = box_name_from_key('imei', msg.substr(0, 4));
  if (!box_name) {
    loge("Can't handle micr_msg:", msg);
    return;
  }
  msg = msg.substr(5);
  log('handle_micro_msg handling', box_name, msg);

  if (msg.indexOf('gps:') !== -1) {
    parts = msg.split(':');
    var coord = {
      lat: parseInt(parts[1]) / 10000.0,
      long: parseInt(parts[2]) / 10000.0,
      createdAt: new Date(),
      type: 'gps',
      from_arduino: true
    };
    log('handle_micro_msg gps insert', coord.lat + ',' + coord.long);
    Coords.insert(coord);
  } else if (msg.indexOf('State:') !== -1) {
    var state = parse_micro_state_msg(msg);
    log('handle_micro_msg StateDict:', box_name, JSON.stringify(state));
    StateMap.upsert({key: 'lastState', box_name: box_name}, {$set: {val: ((new Date()).toISOString()) + ": " + JSON.stringify(state)}});
    if (!state.srt_sent) {
      var locked = StateMap.findOne({key: 'locked', box_name: box_name});
      if (locked && locked.val) {
        sendAlert(box_name, 'arduino restarted in lock state!');
      }
    }
    StateMap.upsert({key: 'locked', box_name: box_name}, {$set: {val: state.locked}});
    if (state.locked) {
      if (boxes[box_name].hasOwnProperty('phone_id')) {
        StateMap.upsert({key: 'phone_watchdog_on', box_name: box_name}, {$set: {val: true}});
      }
    }
    StateMap.upsert({key: 'stream_gps', box_name: box_name}, {$set: {val: state.stream_gps}});
    if (state.bat_volt < 3520 && state.bat_perc < 17) {
      sendAlert(box_name, 'undervoltage');
    }
    if (state.alert_state > 0) {
      sendAndroidMessage('bumped', box_name);
      if (state.alert_state > 1 && !move_alert_sent) {
        sendAlert(box_name, 'Excessive Move');
        move_alert_sent = true;
      }
    }
    if (state.alert_state <= 1) {
      move_alert_sent = false;
    }
  }
  log('handle_micro_msg update boxes[' + box_name + '].micro_last_ping');
  boxes[box_name].micro_last_ping = (new Date()).getTime();
};

var parse_alert_stack = function(msg) {
  if (msg.length === 0) {
    return 0;
  }
  return parseInt(msg.slice(-1)); // Ignore the stack, just get the most recent state
}

var parse_micro_state_msg = function(msg) {
  var parts = msg.substr("State:".length).split('-').map(function (x) { return x.substr(1);});
  return {
    stream_gps: parseInt(parts[0]),
    locked: parts[1] === '1',
    srt_sent: parts[2] === '1',
    move_count: parseInt(parts[3]),
    bat_perc: parseInt(parts[4]),
    bat_volt: parseInt(parts[5]),
    alert_state: parse_alert_stack(parts[6]),
    last_action: parts[7],
  };
}

Router.route('/sms', {where: 'server'})
  .post(function () {
      handle_micro_msg(this.request.body.Body);
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call', {where: 'server'})
  .post(function () {
      log('Respond to /call');
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call_completed', {where: 'server'})
  .post(function () {
      var box_name = box_name_from_key('fona_number', this.request.body.To);
      if (!box_name) {
        loge('call_completed with invalid box_name: ', box_name);
        this.response.end('Invalid box_name');
        return;
      }
      log('Respond to /call_completed for', box_name);
      StateMap.upsert({key: 'ringStatus', box_name: box_name}, {$set: {val: 'completed'}});
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end();
  });

var phoneWatchdogWaiting = false;
Meteor.setInterval(function() {
    Object.keys(boxes).forEach(function (box_name) {
      var locked = StateMap.findOne({key: 'locked', box_name: box_name});
      if (!locked || !locked.val) {
        return;
      }
      if (boxes[box_name].micro_last_ping + MICRO_WATCHDOG_TIMEOUT < (new Date()).getTime()) {
        log('watchdog: micro watchdog too old for', box_name + ':', boxes[box_name].micro_last_ping, (new Date()).getTime());
        sendAlert(box_name, 'micro watchdog expired!');
        StateMap.update(locked._id, {$set: {val: false}});
      } else {
        log('watchdog: micro interval for', box_name, '=', (new Date()).getTime() - boxes[box_name].micro_last_ping);
      }
    });

    Object.keys(boxes).forEach(function (box_name) {
      var on = StateMap.findOne({key: 'phone_watchdog_on', box_name: box_name});
      if (!on || !on.val) {
        return;
      }
      if (phoneWatchdogWaiting) {
        return;
      }
      if (boxes[box_name].phone_last_ping + PHONE_WATCHDOG_TIMEOUT < (new Date()).getTime()) {
        sendAndroidMessage('alive_check', box_name);
        phoneWatchdogWaiting = true;
        Meteor.setTimeout(function() {
            if (boxes[box_name].phone_last_ping + PHONE_WATCHDOG_TIMEOUT < (new Date()).getTime()) {
              sendAlert(box_name, 'phone did not respond!');
              StateMap.update(on._id, {$set: {val: false}});
              StateMap.upsert({key: 'phone_watchdog_on', box_name: box_name}, {$set: {val: false}});
            }
            phoneWatchdogWaiting = false;
          }, 10000);
      } else {
        log('watchdog: phone interval for', box_name, '=', (new Date()).getTime() - boxes[box_name].phone_last_ping);
      }
    });
}, 2000);

net.createServer(Meteor.bindEnvironment( function ( socket ) {
  socket.on("error", function(err) {
    loge("TCP Error on 5000");
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
    loge("TCP Error on 3001");
    global_clients.splice(global_clients.indexOf(socket), 1);
    log('stack', err.stack);
    socket.destroy();
  });

  socket.on('end', function() {
    var i = global_clients.indexOf(socket);
    if (i !== -1) {
      global_clients.splice(i, 1);
    }
    log('3001 disconnected, global_clients left:', global_clients.length);
  });

  socket.addListener("data", Meteor.bindEnvironment(function(data) {
        log('3001 data', data.toString('base64'));
        if (data.toString('ascii').indexOf('text/html') !== -1) {
            socket.write(header);
            global_clients.push(socket); // TODO kinda race condition.. this should be locked?
            log('global_clients.length', global_clients.length);
        } else if (data.toString('ascii').indexOf('Accept: image/webp') !== -1 || data.toString('ascii').indexOf('curl') !== -1) {
            socket.write(header);
            global_clients.push(socket);
            log('global_clients.length', global_clients.length);

        } else {
          socket.end();
        }
  }));
})).listen( 3001 );

net.createServer(Meteor.bindEnvironment( function ( socket ) {
  log('connection on 4000');
  var recording_name = (new Date()).toISOString() + '.vid';
  socket.on('end', function () {
    log('4000 streaming connection closed');
  });

  socket.on("error", function(err) {
    loge("TCP Error on 4000");
    log('stack', err.stack);
    socket.destroy();
  });

  socket.addListener( "data", Meteor.bindEnvironment( function ( data ) {
        StateMap.upsert({key: 'frame_count', box_name: 'Caltrain'}, {$inc: {val: 1}});
        for (var i = 0; i < global_clients.length; i++) {
          global_clients[i].write(data);
        }
        // Weird.. have to put this after "write" to stop glitchy stuff.. I'm guessing the feed goes out of order otherwise
        // could keep the file open if that's usefully faster
        fs.appendFileSync(video_dir + recording_name, data);
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
            //log('done');
            //Meteor.clearInterval(interval);
            //socket.end();
            //return;
          //}
          //if (alive) {
            //log('write', loc);
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
          //StateMap.upsert({key: 'frame_count', box_name: 'Caltrain'}, {$inc: {val: 1}});
          //log('found');
        //}
        //if (CameraFrames.find().count() < 50) {
          //cur_frame = Buffer.concat([cur_frame, data]);
          //log('part of frame inserted');
          //var sr = cur_frame.toString('binary');
          //if (sr.indexOf('--myboundary') !== -1) {
            //var first = sr.substr(0, sr.indexOf('--myboundary') + '--myboundary'.length + 2);
            //var second = sr.substr(sr.indexOf('--myboundary') + '--myboundary'.length + 2);
            //if (global_frame_count > 1) {
              //CameraFrames.insert({timestamp: (new Date()).getTime(), img: first});
            //}
            //log('added full frame', first.length);
            //cur_frame = new Buffer(second);
            //log(cur_frame.slice(40, 200).toString('utf8'));
            //log(cur_frame.slice(40, 200));
          //}
          ////log(data.slice(0, 200).toString('utf8'));
          //global_frame_count += 1;
          ////log('insert', global_frame_count);
          ////CameraFrames.insert({timestamp: (new Date()).getTime(), img: global_frame_count});
        //}
