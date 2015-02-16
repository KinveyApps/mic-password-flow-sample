MPF: Mobile Identity Connect password flow
====================================

MPF is a utility meant to simplify testing auth integration with Kinvey.  The
code is also written to be used as a sample for how to use the password flow.

## Usage


### Prerequisites

Before you start, make sure you've installed [Node.js](http://nodejs.org/) for
your platform.

To get started with MPF clone the repo:

    git clone https://github.com/KinveyApps/mic-password-flow-sample.git

Once you have the sources checked out you'll need to replace all instances of
the phrase `SET_TO_YOUR_APP_VALUE` with the appropriate settings.

- kinveyAppId -- Found in the Kinvey console on the Dashboard for your app
  (APP ID)
- kinveyAppSecret -- Found in the Kinvey console on the Dashboard for your app
  (APP SECRET)
- redirectUri -- This is defined by the *client* app that you're building, but
  it must be registered in the Kinvey console in the Auth Link configuration
  in the settings section of the Users page.

The app will not run until these have been configured correctly.

Finally, make sure to install all of the dependencies:

    npm install

### Running

MPF takes two arguments, username and password.

    node mpf.js <username> <password>

You can also install your *modified* version of MPF by running

    npm install -g

from the checked out directory.  You'll be able to run the MPF now by running:

    mpf <username> <password>

Make sure to re-run the install command if you change MPF.

## Flow

The flow for getting the Mobile Identity Connect token is:

1. requestAuthURI -- Get the temporary auth URI for getting codes
2. requestAuthGrant -- Use the temporary auth URI to get an authorization code
3. requestTokens -- Exchange the auth code for access and refresh tokens

This is the complete interaction with MIC (at least from the client).

The client then needs to login to the Kinvey Platform, which generates a user
session.  Here's the flow that we're using in this sample:

1. checkKinveyUsername -- See if the user exists on Kinvey
2. performKinveyAuth -- If the user exists we call `/login` to generate the
   user session.  If the user does not exist, we `POST` to `/` to create the
   user and get a session.



## Output

The output from the script is a valid Kinvey session token that can be used in
via the `Authorization` header:

    Authorization: Kinvey <token returned from mpf>

The utility also provides a sample [cURL](http://curl.haxx.se/) command that
you can use to verify the user.  You can also use that command as a base for
exploring Kinvey from the command line.
