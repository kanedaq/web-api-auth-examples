/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

require('dotenv').config();
// var client_id = 'CLIENT_ID'; // Your client id
// var client_secret = 'CLIENT_SECRET'; // Your secret
// var redirect_uri = 'REDIRECT_URI'; // Your redirect uri
var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

// スパムとみなされないように、API呼び出し間にsleepを入れる
const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// アルバム情報と、アルバム内の各トラック情報を出力する
function get_an_album(access_token, body_an_artists_albums, index) {
  if (body_an_artists_albums.items.length <= index) {
    return;
  }

  const album_id = body_an_artists_albums.items[index].id;
  var options = {
    url: 'https://api.spotify.com/v1/albums/' + album_id + '?market=JP',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(options, async function(error, response, body) {
    const indent1 = '\t';
    const indent2 = '\t\t';

    // アルバム情報を出力する
    console.log(indent1
      + '(' + ('00' + (index + 1)).slice(-2) + ') '
      + body_an_artists_albums.items[index].album_type + ': '
      + body_an_artists_albums.items[index].name
      + ' (' + body_an_artists_albums.items[index].release_date + ')');
    
    for (ii = 0; ii < body.tracks.items.length; ++ii) {
      // アルバム内の各トラック情報を出力する
      console.log(indent2
        + '[' + ('0' + body.tracks.items[ii].track_number).slice(-2) + '] '
        + body.tracks.items[ii].name);
    }

    await _sleep(500);
    get_an_album(access_token, body_an_artists_albums, index + 1);
  });
}

// アーティストの各アルバム情報配下を出力する
function get_an_artists_albums(access_token, artist_id) {
  var options = {
    url: 'https://api.spotify.com/v1/artists/' + artist_id + '/albums?market=JP&limit=50',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(options, async function(error, response, body) {
    await _sleep(500);
    get_an_album(access_token, body, 0);
  });
}

// アーティスト情報配下を出力する
function get_an_artist(access_token, artist_id) {
  var options = {
    url: 'https://api.spotify.com/v1/artists/' + artist_id,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(options, async function(error, response, body) {
    // アーティスト情報を出力する
    console.log(body.type + ': ' + body.name);
    console.log('followers: ' + body.followers.total);
    
    await _sleep(500);
    get_an_artists_albums(access_token, artist_id);
  });
}

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, async function(error, response, body) {
          console.log(body);

          // データ取得＆出力
          console.log('--------------------');
          const artist_id = process.env.ARTIST_ID;
          await _sleep(500);
          get_an_artist(access_token, artist_id);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);
