// -*- mode: js; flycheck-jshintrc: "jshintrc"; js-indent-level: 2 -*-
// Copyright (c) 2015, Kinvey, Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
// in compliance with the License. You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License
// is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
// or implied. See the License for the specific language governing permissions and limitations under
// the License.

"use strict";

var colors = require('colors');
var request = require('request');
var util = require('util');

/** This should be set to what the name of the script is for error reporting. */
var nodeScriptName = "";

var SET_TO_YOUR_APP_VALUE = "Set this to your app specific value before running.";

var kinveyAppId = SET_TO_YOUR_APP_VALUE;           // App ID from Kinvey Console
var kinveyAppSecret = SET_TO_YOUR_APP_VALUE;       // App Secret from Kinvey Console
var redirectUri = SET_TO_YOUR_APP_VALUE;           // This is the redirect URI configured in the console

var kinveyAuthInstanceName = "auth"; // If not running on multi-tenant change this to your instance name, eg vmwus1-auth
var kinveyDataInstanceName = "baas"; // If not running on multi-tenant change this to your instance name, eg vmwus1-baas

// Do not change these
var authUrlRoot = "https://" + kinveyAuthInstanceName + ".kinvey.com/oauth/";
var dataUrlRoot = "https://" + kinveyDataInstanceName + ".kinvey.com/appdata/" + kinveyAppId + "/";
var userUrlRoot = "https://" + kinveyDataInstanceName + ".kinvey.com/user/"    + kinveyAppId + "/";
var rpcUrlRoot  = "https://" + kinveyDataInstanceName + ".kinvey.com/rpc/"     + kinveyAppId + "/";


// Utilities

/** Kill the program with a *catchable* exception if condition is false. */
function assert(bool, message){
  if (!bool){
    if (!message){
      message = "Expected expression to evaluate to true";
    }
    message += ": ";
    console.error(message, bool);
    throw new Error("Assertion failed!");
  }
}

/** Parse JSON string into JS object, returning {} if object is not parsable. */
function safeJsonParse(string){
  var obj;
  try {
    obj = JSON.parse(string);
  } catch (e) {
    obj = {};
  }
  return obj;
}

/** Kill the program reporting a message. */
function die(message){
  console.error(nodeScriptName + ": ", message);
  process.exit(-1);
}

/** Report that a request failed and return an error based on the message. */
function reportRequestFailure(response, message){
  var headers = response.headers;
  var status = response.statusCode;

  var contentType = headers["content-type"];
  var requestId = headers["x-kinveyauth-request-id"] || headers["x-kinvey-request-id"];

  console.log("!!! ", message, ":");
  console.log("!!! \tHTTP Status:   ", status);
  console.log("!!! \tRequest ID:    ", requestId);

  if (contentType.indexOf("application/json") !== -1){
    // JSON Body, may already be parsed
    var debugMessage = response.body;
    try {
      debugMessage = JSON.parse(response.body);
    } catch(e){} // We're already parsed, ignore the error
    
    console.log("!!! \tError:         ", debugMessage.error);
    console.log("!!! \tDescription:   ", debugMessage.description);
    console.log("!!! \tDebug:         ", debugMessage.debug);
  } else {
    console.log("!!! \tResponse body: ", response.body);
  }


  console.log("\n*** Stacktrace follows: ");

  return new Error("Request returned unsuccessfully");
}


// Kinvey Mobile Identity Connect related functions


/**
 * Request the temporary auth URI from MIC.  This temporary auth URI
 * will be used in the next step.
*/
function requestAuthURI(callback){
  var options = {
    url: authUrlRoot + "auth",
    followRedirect: false,
    form: {
      client_id: kinveyAppId,
      redirect_uri: redirectUri,
      response_type: "code"
    }
  };

  request.post(options, function(error, httpResponse, body){
    var bodyObject = safeJsonParse(body);
    if (bodyObject.temp_login_uri){
      return callback(null, bodyObject.temp_login_uri);
    } else if (error) {
      console.log(error);
      return callback(error);
    } else {
      return callback(reportRequestFailure(httpResponse, "Error obtaining temp login URI"));
    }
  });

}

/** Request an auth grant for this user.  This is step 2 in the auth flow,
 * it uses the temp URI as the resource that is authenticated against.
 * The response is an auth grant which can be used to obtain tokens, this
 * is limited in duration.
*/
function requestAuthGrant(tempUri, username, password, callback){
  var options = {
    url: tempUri,
    followRedirect: false,
    auth: {
      user: kinveyAppId,
      pass: kinveyAppSecret,
      sendImmediately: true
    },
    form: {
      client_id: kinveyAppId,
      redirect_uri: redirectUri,
      response_type: "code",
      username: username,
      password: password
    }
  };

  request.post(options, function(error, httpResponse, body){
    if (httpResponse && httpResponse.headers && httpResponse.headers.location){
      var location = httpResponse.headers.location;
      // Location redirect is <redirect url>?code=<grant code>
      // so the grant code starts at =+1
      var code = location.substr(location.lastIndexOf('=') + 1);
      return callback(null, code);
    } else if (error) {
      console.log(error);
      return callback(error);
    } else {
      return callback(reportRequestFailure(httpResponse, "Requesting auth grant failed"));
    }
  });
}

/** Request the auth token and refresh token (if enabled).  This is the final step
 * in the MIC auth flow.  The response is the authentication token and a refresh
 * token (if refresh tokens have been configured in the console).
*/
function requestTokens(code, callback){
  var options = {
    url: authUrlRoot + "token",
    followRedirect: false,
    auth: {
      user: kinveyAppId,
      pass: kinveyAppSecret,
      sendImmediately: true
    },
    form: {
      client_id: kinveyAppId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code: code
    }
  };

  request.post(options, function(error, httpResponse, body){
    var bodyObject = safeJsonParse(body);

    if (bodyObject.token_type){
      return callback(null, bodyObject);
    } else if (error) {
      console.log(error);
      return callback(error);
    } else {
      return callback(reportRequestFailure(httpResponse, "Requesting OAuth token failed"));
    }
  });
}



/** Check to see if the given username exists in this app */
function checkKinveyUsername(username, tokens, callback){
  var options = {
    url: rpcUrlRoot + "check-username-exists",
    followRedirect: false,
    auth: {
      user: kinveyAppId,
      pass: kinveyAppSecret
    },
    json: {
      username: username
    }
  };

  request.post(options, function(error, httpResponse, body){
    if (body.usernameExists !== undefined && body.usernameExists !== null){
      return callback(null, body.usernameExists);
    } else if (error){
      console.log(error);
      return callback(error);
    } else {
      return callback(reportRequestFailure(httpResponse, "Checking username existence"));
    }
  });

}


/** Authenticate against KCS with the username and access tokens */
function performKinveyAuth(username, tokens, callback){
  checkKinveyUsername(username, tokens, function(error, userExists){
    var accessToken = tokens.access_token;
    var options = {
      url: "",
      followRedirect: false,
      auth: {
        user: kinveyAppId,
        pass: kinveyAppSecret
      },
      json: {
        username: username,
        _socialIdentity: {
          kinveyAuth: {
            access_token: accessToken
          }
        }
      }
    };

    // If the user already exists we need to just login as that user, otherwise
    // we need to create the user.  Since it's more likely that the user exists
    // an alternative strategy is to login, and if that fails to create the user
    if (userExists){
      console.log("User " + username + " exists, logging in...");
      options.url = userUrlRoot + "login";
    } else {
      console.log("User " + username + " does not exist, creating...");
      options.url = userUrlRoot;
    }

    request.post(options, function(error, httpResponse, body){

      if (body._kmd && body._kmd.authtoken){
        callback(null, body._kmd.authtoken);
      } else if (error){
        console.log(error);
        return callback(error);
      } else {
        return callback(reportRequestFailure(httpResponse, "Either creating the user or logging in failed"));
      }
    });
  });
}

// Main Script
nodeScriptName = process.argv[1];

var username = process.argv[2] || process.env.USERNAME || die("Invalid Username");
var password = process.argv[3] || process.env.PASSWORD || die("Invalid password");

// Ensure that all defaults have been updated before running
assert(username, "Username must not be null/undefined");
assert(password, "Passowrd must not be null/undefined");
assert(kinveyAppId !== SET_TO_YOUR_APP_VALUE, "Kinvey App ID != SET_TO_YOUR_APP_VALUE");
assert(kinveyAppSecret !== SET_TO_YOUR_APP_VALUE, "Kinvey App Secret != SET_TO_YOUR_APP_VALUE");
assert(redirectUri !== SET_TO_YOUR_APP_VALUE, "Redirect URI != SET_TO_YOUR_APP_VALUE");


// Step 1
requestAuthURI(function(error, loginUri){
  if (error) {
    throw error;
  } else {
    // Step 2
    requestAuthGrant(loginUri, username, password, function(err, code){
      if (err){
        throw err;
      } else {
        // Step 3
        requestTokens(code, function(e, tokens){
          if (e){
            throw e;
          } else {
            // We have completed tokens from MIC
            console.log("\n");
            console.log("Mobile Identity Connect auth completed successfully.");
            console.log("Got tokens: ");
            console.log(util.inspect(tokens, {colors: true}));
            console.log("");

            console.log("\nExchanging MIC access token for Kinvey session token.\n");

            performKinveyAuth(username, tokens, function(e, kinveyToken){
              if (e) {
                throw e;
              } else {
                var curlCommand = "curl -X GET -H 'Authorization: Kinvey " + kinveyToken + "' " + dataUrlRoot;

                console.log("\nKinvey Session token for user " + username.green + " is " + kinveyToken.green);

                console.log("\nYou can use cURL to make requests as this user in the following way:");
                console.log("\t" + curlCommand.green.bold + "\n");
              }
            });
            
          }
        });
      }
    });
  }
});
