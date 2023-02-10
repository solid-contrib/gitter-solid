// Gitter chat data to solid
// like GITTER_TOKEN 1223487...984 node solid-gitter.js
// See https://developer.gitter.im/docs/welcome
// and https://developer.gitter.im/docs/rest-api

// import { Matrix } from 'matrix-api/Matrix';

// const Matrix = require('matrix-api/Matrix').Matrix  // https://www.npmjs.com/package/matrix-api
// import { Matrix } from 'matrix-api/Matrix';
// import { Matrix } from 'matrix-api/Matrix.js';

import * as sdk from "matrix-js-sdk";// https://github.com/matrix-org/matrix-js-sdk
  // API Docs: https://matrix.org/docs/guides/usage-of-the-matrix-js-sdk

import myCrypto from 'crypto'

import * as dotenv from 'dotenv'
import * as $rdf from 'rdflib'
import solidNamespace from "solid-namespace"
// import * as solidNamespace  from 'solid-namespace'
import * as Gitter from 'node-gitter'
import { SolidNodeClient } from 'solid-node-client'
import * as  readlineSync from 'readline-sync'
import * as readline from 'readline'

import { show } from "./src/utils.mjs"
import { setRoomList } from "./src/matrix-utils.mjs";
import Message from "./src/class-message.mjs";

dotenv.config()

const matrixUserId = process.env.MATRIX_USER_ID || "@timbllee:matrix.org";
const matrixAccessToken = process.env.MATRIX_ACCESS_TOKEN || "syt_dGltYmxsZWU_lCSmPVdmmykTLyUJrZws_1nKivD";
const matrixBaseUrl = process.env.MATRIX_BASE_URL || "http://matrix.org";



/* SILENCE FETCH_QUEUE ERRORS
     see https://github.com/linkeddata/rdflib.js/issues/461
*/
/*
console.log = (...msgs)=>{
  for(var m of msgs){
    m = m.toString()
    if( !m.match('fetchQueue') ){
      console.warn(m);
    }
  }
}
*/
let command = process.argv[2]
let targetRoomName = process.argv[3]
const archiveBaseURI = process.argv[4]

const GITTER = false
const MATRIX = true

const numMessagesToShow = 20
let matrixClient = null

// If this is run on startup, readline-sync will not work
function initReadlineAsync() {
  return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      // completer: completer,
  });
}

// const MATRIX_APP_ORIGIN = 'timbl.com' // or makybe a solidcommmunity pod

if (typeof crypto === 'undefined') {
  var crypto = myCrypto
  // console.log("gitter-solid local crypo", crypto)
  global.crypto = myCrypto
} else {
  // console.log("gitter-solid  global crypo", crypto)
}
// console.log("gitter-solid crypo", crypto)
// see https://www.npmjs.com/package/node-g


let gitter, GITTER_TOKEN

if (GITTER) {
  GITTER_TOKEN = process.env.GITTER_TOKEN
}
const ns = solidNamespace($rdf)
if (!ns.wf) {
  ns.wf = new $rdf.Namespace('http://www.w3.org/2005/01/wf/flow#') //  @@ sheck why necessary
}

///////////// MATRIX /////////////////

const MESSAGES_AT_A_TIME = 20 // make biggers

let roomList = []



function matrixShowRoomString (room) {
    var msg = room.timeline[room.timeline.length - 1];
    var dateStr = "---";
    if (msg) {
        dateStr = new Date(msg.getTs()).toISOString().replace(/T/, " ").replace(/\..+/, "");
    }
    var myMembership = room.getMyMembership();
    const star = myMembership ? '*' : ' '
    var roomName = room.name
    return ` ${roomName} %s (${room.getJoinedMembers().length} members)${star}  ${dateStr}`
}

function matrixPrintRoomList() {
    // console.log(CLEAR_CONSOLE);
    console.log("Room List:");
    roomList.forEach((room) => {
      console.log(matrixShowRoomString(room));
    });
}

function matrixShowMessage (event, myUserId) {
    var name = event.sender ? event.sender.name : event.getSender();
    var time = new Date(event.getTs()).toISOString().replace(/T/, " ").replace(/\..+/, "");
    var separator = "<<<";
    if (event.getSender() === myUserId) {
        name = "Me";
        separator = ">>>";
        if (event.status === sdk.EventStatus.SENDING) {
            separator = "...";
        } else if (event.status === sdk.EventStatus.NOT_SENT) {
            separator = " x ";
        }
    }
    var body = "";

    var maxNameWidth = 15;
    if (name.length > maxNameWidth) {
        name = name.slice(0, maxNameWidth - 1) + "\u2026";
    }

    if (event.getType() === "m.room.message") {
        body = event.getContent().body;
    } else if (event.isState()) {
        var stateName = event.getType();
        if (event.getStateKey().length > 0) {
            stateName += " (" + event.getStateKey() + ")";
        }
        body = "[State: " + stateName + " updated to: " + JSON.stringify(event.getContent()) + "]";
        separator = "---";
    } else {
        // random message event
        body = "[Message: " + event.getType() + " Content: " + JSON.stringify(event.getContent()) + "]";
        separator = "---";
    }
    return `[${time}] ${name}: ${separator}; ${body}`
}

function matrixLoadRoomMessages (room) {
    console.log(`loadRoomMessages: room name ${room.name}`)
    // console.log(show(room))
    matrixClient.scrollback(room, MESSAGES_AT_A_TIME).then(
        function (room) {
            const mostRecentMessages = room.timeline;
            for (var i = 0; i < mostRecentMessages.length; i++) {
                console.log(matrixShowMessage(mostRecentMessages[i], room.myUserId));
            }
            /*
            let rl = initReadlineAsync();
            rl.prompt();
            */
        },
        function (err) {
            console.error("loadRoomMessages ##### Error: %s", err);
        },
    );
}

async function matrixProcessRooms () {
    for (let i = 0; i < roomList.length; i++) {
        const room = roomList[i]
        console.log(`\n Room "${i}": <${room.roomId}> ${matrixShowRoomString(room)}`)
        console.log(`    timeline(${room.timeline.length}`)
        // console.log(JSON.stringify(room))

        var myMembership = room.getMyMembership();
        console.log('myMembership ' + (show(myMembership)))

        for (let i = 0; i < room.timeline.length; i++) {
            const timeline = room.timeline[i]
            console.log(`  timeline status ${timeline.status}`)
            if (room.timeline[i].status == sdk.EventStatus.NOT_SENT) {
                notSentEvent = room.timeline[i];
                break;
            }
        }

        for (let prop in room) {
            const typ = typeof room[prop]
            console.log(`   ${prop}: ${show(room[prop])}`) // ${room[prop]}
        }
        matrixLoadRoomMessages(room)
    }
}

async function matrixInitialise() {
  console.log(matrixAccessToken)
  matrixClient = sdk.createClient({
      baseUrl: matrixBaseUrl,
      accessToken: matrixAccessToken,
      userId: matrixUserId,
  });

  const client = matrixClient
  await client.startClient({ initialSyncLimit: 10 });


  client.once("sync", async function (state, prevState, res) {
      if (state === "PREPARED") {
          console.log("prepared");
          await matrixProcessRooms()
      } else {
          console.log('Fatal Error:  state not prepared: ' + state);
          // console.log(state);
          process.exit(1);
      }
  });

  matrixClient.startClient(numMessagesToShow); // messages for each room.

  roomList = matrixClient.getRooms();

  // const allPublicRooms = await matrixClient.publicRooms() // ,"total_room_count_estimate":80707
  // console.log('rooms.total_room_count_estimate ',  rooms.total_room_count_estimate) //

  console.log('getRooms  ' + JSON.stringify(roomList)) //

  
  /**
   * It takes a second for all rooms to load on startup.
   * This promise solution is all but elegant, but it works for now at least
   */
  matrixClient.on("Room", function () {
      roomList = setRoomList(matrixClient);
      console.log('on Room room list: ' + roomList.length + ' rooms')
  });
  console.log("Loading rooms...")
  await new Promise(resolve => setTimeout(resolve, 5000))
 }

function matrixOldInitialise() {
  // Connect to your Matrix endpoint:
  const baseUrl = 'https://matrix.org/_matrix';
  const matrix  = new Matrix(baseUrl);

  // Open the login popup, targetting the url from the first step:
  // const redirectUrl = location.origin + '/accept-sso'; // MATRIX_APP_ORIGIN
  const redirectUrl = MATRIX_APP_ORIGIN + '/accept-sso'; // MATRIX_APP_ORIGIN

  matrix.initSso(redirectUrl);

  // ... and wait for the user to log in:
  matrix.addEventListener('logged-in', event => {

  	console.log('Logged in!', event);

  	// Start polling the server
  	matrix.listenForServerEvents();

  	// Act on events of only one type:
  	matrix.addEventListener('m.room.message', event => console.log('Matrix Message:', event));

  	// Act on events of another type:
  	matrix.addEventListener('m.reaction', event => console.log('Matrix Reaction:', event));

  	// Act on ALL events from the server:
  	matrix.addEventListener('matrix-event', event => console.log('Matrix Event:', event));

  });
}

async function init() {
  if(!command) {
    command = readlineSync.question('Command (e.g. create) : ');
  }

  // The script currently only supports Matrix using ALL
  if (MATRIX) {
    await matrixInitialise()
    targetRoomName = "all";
  }

  if (GITTER) {
    // Target room name will already be defined if Matrix is enabled
    if(!targetRoomName) {
      targetRoomName = readlineSync.question('Gitter Room (e.g. solid/chat) : ');
    }
    if (!GITTER_TOKEN) {
      GITTER_TOKEN = readlineSync.question('Gitter Token : ');
    }
    gitter = new Gitter(GITTER_TOKEN)

  }

}



function confirm (q) {
  while (1) {
    var a = (readlineSync.question(q+' (y/n)? ')).trim().toLowerCase();
    if (a === 'yes' || a === 'y') return true
    if (a === 'no' || a === 'n') return false
    console.log('  Please reply y or n')
  }
}

const normalOptions = {
//   headers: {Authorization: 'Bearer ' + SOLID_TOKEN}
}
const forcingOptions = {
  // headers: {Authorization: 'Bearer ' + SOLID_TOKEN},
  force: true }

function clone (options) {
  return Object.assign({}, options)
}

/// ///////////////////////////// Solid Bits

const auth = new SolidNodeClient({parser:$rdf})
const fetcherOpts = {fetch: auth.fetch.bind(auth), timeout: 900000};

const store = $rdf.graph()
const rdfStore = store // shorthand -- knowledge base
const fetcher = $rdf.fetcher(rdfStore, fetcherOpts)
const updater = new $rdf.UpdateManager(rdfStore)

function delayMs (ms) {
  console.log('pause ... ')
  return new Promise(resolve => setTimeout(resolve, ms))
}

function rdfChatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

/* Test version of update
*/

/*
async function update (ddd, sts) {
  const doc = sts[0].why
  // console.log('   Delete ' + ddd.length )
  console.log('   Insert ' + sts.length + ' in ' + doc)
  for (let i = 0; i < sts.length; i++) {
    let st = sts[i]
    console.log(`       ${i}: ${st.subject} ${st.predicate} ${st.object} .`)
  }
}
*/
// individualChatFolder', 'privateChatFolder', 'publicChatFolder
function gitterArchiveBaseURIFromRoom (room, config) {
  const folder = room.oneToOne ? config.individualChatFolder
         : room.public ? config.publicChatFolder : config.privateChatFolder
  return (folder.uri) ? folder.uri : folder // needed if config newly created
}

function matrixArchiveBaseURIFromRoom(room, config) {
  // TODO: implement different folders. Currently Matrix will just default to public
  const folder = config.publicChatFolder;
  return (folder.uri) ? folder.uri : folder;
}

/** Decide URI of solid chat vchanel from properties of gitter room
 *
 * @param room {Room} - like 'solid/chat'
*/
function chatChannelFromRoom (room, config, archiveBaseURI) {
  var path
  let segment = room.name.split('/').map(encodeURIComponent).join('/') // Preseeve the slash begween org and room
  if (room.githubType === 'ORG') {
    segment += '/_Organization' // make all multi rooms two level names
  }
  if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
  if (room.oneToOne) {
    var username = room.user.username
    if (!username) throw new Error('one-one must have user username!')
    console.log(`     ${room.githubType}: ${username}: ${room.name}`)
    path = archiveBaseURI + username
  } else {
    path = archiveBaseURI + segment
  }
  return $rdf.sym(path + '/index.ttl#this')
}

/** Track gitter users

*/

async function rdfPutResource (doc) {
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fetcher in future
  return fetcher.putBack(doc, clone(normalOptions))
}

async function rdfLoadIfExists (doc) {
  try {
    // delete fetcher.requested[doc.uri]
    await fetcher.load(doc, clone(normalOptions))
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      // console.log('    No chat file yet, creating later ' + doc)
      return false
    } else {
      console.log(' #### Error reading  file ' + err)
      console.log('            error object  ' + JSON.stringify(err))
      console.log('        err.response   ' + err.response)
      console.log('        err.response.status   ' + err.response.status)
      process.exit(4)
    }
  }
}

function suitable (x) {
  let tail = x.uri.slice(0, -1).split('/').slice(-1)[0]
  if (!'0123456789'.includes(tail[0])) return false // not numeric
  return true
  // return kb.anyValue(chatDocument, POSIX('size')) !== 0 // empty file?
}

async function rdfFirstMessage (chatChannel, backwards) { // backwards -> last message
  var folderStore = $rdf.graph()
  var folderFetcher = new $rdf.Fetcher(folderStore,fetcherOpts)
  async function earliestSubfolder (parent) {
    // console.log('            parent ' + parent)
    delete folderFetcher.requested[parent.uri]
    var resp = await folderFetcher.load(parent, clone(forcingOptions)) // Force fetch as will have changed

    var kids = folderStore.each(parent, ns.ldp('contains'))
    kids = kids.filter(suitable)
    if (kids.length === 0) {
      console.log('            parent2 ' + parent)

      console.log('resp.status ' + resp.status)
      console.log('resp.statusText ' + resp.statusText)

      console.log('folderStore: <<<<<\n' + folderStore + '\n >>>>>>>> ')
      console.trace('ooops no suitable kids - full list:' + folderStore.each(parent, ns.ldp('contains')))
      console.log(' parent: ' + parent)
      console.log(' \ndoc contents: ' + folderStore.statementsMatching(null, null, null, parent))
      console.log(' connected statements: ' + folderStore.connectedStatements(parent))
      // console.log(' connected statements: ' + folderStore.connectedStatements(parent)).map(st => st.toNT()).join('\n   ')
    }

    kids.sort()
    if (backwards) kids.reverse()
    return kids[0]
  }
  let y = await earliestSubfolder(chatChannel.dir())
  let month = await earliestSubfolder(y)
  let d = await earliestSubfolder(month)
  let chatDocument = $rdf.sym(d.uri + 'chat.ttl')
  await folderFetcher.load(chatDocument, clone(normalOptions))
  let messages = folderStore.each(chatChannel, ns.wf('message'), null, chatDocument)
  if (messages.length === 0) {
    let msg = '  INCONSITENCY -- no chat message in file ' + chatDocument
    console.trace(msg)
    throw new Error(msg)
  }
  let sortMe = messages.map(message => [folderStore.any(message, ns.dct('created')), message])
  sortMe.sort()
  if (backwards) sortMe.reverse()
  console.log((backwards ? 'Latest' : 'Earliest') + ' message in solid chat is ' + sortMe[0][1])
  return sortMe[0][1]
}

async function rdfSaveEverythingBack () {
  // console.log('Saving all modified files:')
  for (let uri in toBePut) {
    if (toBePut.hasOwnProperty(uri)) {
      console.log('Putting ' + uri)
      await rdfPutResource($rdf.sym(uri))
      delete fetcher.requested[uri] // invalidate read cache @@ should be done by fether in future
    }
  }
  // console.log('Saved all modified files.')
  toBePut = []
}

///////////////// GITTER ONLY

async function authorFromGitter (fromUser, archiveBaseURI) {
  /* fromUser looks like
    "id": "53307734c3599d1de448e192",
    "username": "malditogeek",
    "displayName": "Mauro Pompilio",
    "url": "/malditogeek",     meaning https://github.com/malditogeek
    "avatarUrlSmall": "https://avatars.githubusercontent.com/u/14751?",
    "avatarUrlMedium": "https://avatars.githubusercontent.com/u/14751?"
  */
  async function saveUserData (fromUser, person) {
    const doc = person.doc()
    store.add(person, ns.rdf('type'), ns.vcard('Individual'), doc)
    store.add(person, ns.rdf('type'), ns.foaf('Person'), doc)
    store.add(person, ns.vcard('fn'), fromUser.displayName, doc)
    store.add(person, ns.foaf('homepage'), 'https://github.com' + fromUser.url, doc)
    store.add(person, ns.foaf('nick'), fromUser.username, doc)
    if (fromUser.avatarUrlMedium) {
      store.add(person, ns.vcard('photo'), $rdf.sym(fromUser.avatarUrlMedium), doc)
    }
    toBePut[doc.uri] = true
  }
  const peopleBaseURI = archiveBaseURI + 'Person/'
  var person = $rdf.sym(peopleBaseURI + encodeURIComponent(fromUser.id) + '/index.ttl#this')
  // console.log('     person id: ' + fromUser.id)
  // console.log('     person solid: ' + person)
  if (peopleDone[person.uri]) {
    // console.log('    person already saved ' + fromUser.username)
    return person
  }
  var doc = person.doc()
  if (toBePut[doc.uri]) { // already have stuff to save -> no need to load
    // console.log(' (already started to person file) ' + doc)
  } else {
    try {
      console.log(' fetching person file: ' + doc)

      await fetcher.load(doc, clone(normalOptions)) // If exists, fine... leave it
    } catch (err) {
      if (err.response && err.response.status && err.response.status === 404) {
        console.log('No person file yet, creating ' + person)
        await saveUserData(fromUser, person) // Patch the file into existence
        peopleDone[person.uri] = true
        return person
      } else {
        console.log(' #### Error reading person file ' + err)
        console.log(' #### Error reading person file   ' + JSON.stringify(err))
        console.log('        err.response   ' + err.response)
        console.log('        err.response.status   ' + err.response.status)
        process.exit(8)
      }
    }
    peopleDone[person.uri] = true
  }
  return person
}
/**  Convert gitter message to Solid
 *
*/
// See https://developer.gitter.im/docs/messages-resource

var newMessages = 0
var oldMessages = 0

async function storeMessage (chatChannel, messageObject, archiveBaseURI, gitterMessageObject=null) {
  // Gitter needs an extra function to determine maker
  if (gitterMessageObject != null) {
    messageObject.maker = await authorFromGitter(gitterMessageObject.fromUser, archiveBaseURI);
  }
  // console.log('        Message sent on date ' + sent)
  var chatDocument = rdfChatDocumentFromDate(chatChannel, messageObject.created)
  var messageRdf = $rdf.sym(chatDocument.uri + '#' + messageObject.id) // like "53316dc47bfc1a000000000f"
  // console.log('          Solid Message  ' + message)

  await rdfLoadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), messageRdf, chatDocument)) {
    // console.log(`  already got ${gitterMessage.sent} message ${message}`)
    oldMessages += 1
    return // alraedy got it
  }
  newMessages += 1
  // console.log(`NOT got ${gitterMessage.sent} message ${message}`)

  
  store.add(chatChannel, ns.wf('message'), messageRdf, chatDocument)
  store.add(messageRdf, ns.sioc('content'), messageObject.content, chatDocument)
  if (messageObject.richContent != null) { // is it new information?
    store.add(messageRdf, ns.sioc('richContent'), messageObject.richContent, chatDocument) // @@ predicate??
  }
  store.add(messageRdf, ns.dct('created'), messageObject.created, chatDocument)
  if (messageObject.modified) {
    store.add(messageRdf, ns.dct('modified'), messageObject.modified, chatDocument)
  }
  store.add(messageRdf, ns.foaf('maker'), messageObject.maker, chatDocument)
  // if (!toBePut[chatDocument.uri]) console.log('   Queueing to write  ' + chatDocument)
  toBePut[chatDocument.uri] = true
  return messageRdf;
}

/** Update message friomn update operation
*
*
  Input payload Like   {"operation":"update","model":{
"id":"5c97d7ed5547f774485bbf05",
"text":"The quick red fox",
"html":"The quick red fox","sent":"2019-03-24T19:18:05.278Z","editedAt":"2019-03-24T19:18:12.757Z","fromUser":{"id":"54d26c98db8155e6700f7312","username":"timbl","displayName":"Tim Berners-Lee","url":"/timbl","avatarUrl":"https://avatars-02.gitter.im/gh/uv/4/timbl","avatarUrlSmall":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=60","avatarUrlMedium":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=128","v":30,"gv":"4"},"unread":true,"readBy":3,"urls":[],"mentions":[],"issues":[],"meta":[],"v":2}}
*/
async function rdfUpdateMessage (chatChannel, payload) {
  var sent = new Date(payload.sent)
  var chatDocument = rdfChatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await rdfLoadIfExists(chatDocument)
  var found = store.any(message, ns.sioc('content'))
  if (!found) {
    console.error('DID NOT FIND MESSAGE TO UPDATE ' + payload.id)
    return
  }

  console.log(`Updating  ${payload.sent} message ${message}`)

  var del = []
  var ins = []
  if (payload.text) {
    let oldText = rdfStore.the(message, ns.sioc('content'))
    if (oldText && payload.text === oldText) {
      console.log(` text unchanged as <${oldText}>`)
    } else {
      del.push($rdf.st(message, ns.sioc('content'), oldText, chatDocument))
      ins.push($rdf.st(message, ns.sioc('content'), payload.text, chatDocument))
    }
  }
  if (payload.html) {
    let oldText = rdfStore.the(message, ns.sioc('richContent'))
    if (oldText && payload.text === oldText.value) {
      console.log(` text unchanged as <${oldText}>`)
    } else {
      if (oldText) {
        del.push($rdf.st(message, ns.sioc('richContent'), oldText, chatDocument))
      }
      ins.push($rdf.st(message, ns.sioc('richContent'), payload.html, chatDocument))
    }
  }
  if (ins.length && payload.editedAt) {
    ins.push($rdf.st(message, ns.dct('modified'), new Date(payload.editedAt), chatDocument))
  }
  try {
    await updater.update(del, ins)
  } catch (err) {
    console.error('\n\nERROR UPDATING MESSAGE ' + err)
  }
}

async function rdfDeleteMessage (chatChannel, payload) {
  var chatDocument = rdfChatDocumentFromDate(chatChannel, new Date()) // @@ guess now
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await rdfLoadIfExists(chatDocument)
  var found = store.any(message, ns.sioc('content'))
  if (!found) {
    console.error('DID NOT FIND MESSAGE TO UPDATE ' + payload.id)
    return
  }
  console.log(`Deleting  ${payload.sent} message ${message}`)
  var del = store.connectedStatements(message)
  try {
    await updater.update(del, [])
  } catch (err) {
    console.error('\n\n Error deleting message: ' + err)
    return
  }
  console.log(' Deeleted OK.' + message)
}

/// /////////////////////////////  Do Room

async function doRoom (room, config) {
  //console.log(room)
  const roomId = room.id || room.roomId;
  console.log(`\nDoing room ${roomId}:  ${room.name}`)
  // console.log('@@ bare room: ' + JSON.stringify(room))
  var gitterRoom, matrixRoom;
  let archiveBaseURI;
  
  if (GITTER) {
    archiveBaseURI = gitterArchiveBaseURIFromRoom(room, config);
    
  }
  if (MATRIX) {
    // TODO
    archiveBaseURI = matrixArchiveBaseURIFromRoom(room, config);
  }
  let solidChannel = chatChannelFromRoom(room, config, archiveBaseURI);

  


  console.log('    solid channel ' + solidChannel)

  function messagesFindEarliestId (messages) {
    var sortMe = messages.map(messageObject => [messageObject.created, messageObject])
    if (sortMe.length === 0) return null
    sortMe.sort()
    const earliest = sortMe[0][1]
    return earliest.id
  }

  async function gitterDoRoomShow () {
    let name = room.oneToOne ? '@' + room.user.username : room.name
    console.log(`     ${room.githubType}: ${name}`)
  }

  async function gitterRoomDetails () {
    let name = room.oneToOne ? '@' + room.user.username : room.name
    console.log(`${room.githubType}: ${name}`)
    console.log(JSON.stringify(room))
  }


  async function catchup () {
    newMessages = 0
    oldMessages = 0
    let messages = [];
    if (GITTER) {
      gitterRoom = gitterRoom || await gitter.rooms.find(room.id)
      let gitterMessages = await gitterRoom.chatMessages() // @@@@ ?

      if (gitterMessages.length !== 50) console.log('  Messages read: ' + messages.length)
      for (let gitterMessage of gitterMessages) {
        let message = new Message(gitterMessage, false);
        await storeMessage(solidChannel, message, archiveBaseURI, gitterMessageObject = gitterMessage)
        messages.push(message);
      }
    } else {
      matrixRoom = await matrixClient.roomInitialSync(roomId, 100);
      console.log("--matrixroom--")
      console.log(matrixRoom)

      for (let matrixMessage of matrixRoom.messages.chunk) {
        if (matrixMessage.type != "m.room.message") {
          console.log("Currently gitter-solid only supports saving messages. Skipping " + matrixMessage.type)
          continue;
        }
        let message = new Message(matrixMessage, true);
        await storeMessage(solidChannel, message, archiveBaseURI);
        messages.push(message);

      }
    }

    await rdfSaveEverythingBack()
    if (oldMessages) {
      console.log('End catchup. Found message we already had.')
      return true
    }
    var newId = messagesFindEarliestId(messages)
    if (!newId) {
      console.log('Catchup found no gitter messages.')
      return true
    }
    // TODO implement for Matrix
    if (GITTER) {
      for (let i = 0; i < 30; i++) {
        newId = await gitterExtendBeforeId(newId)
        if (!newId) {
          console.log(`End catchup. No more gitter messages after ${newMessages} new messages.`)
          return true
        }
        if (oldMessages) {
          console.log(`End catchup. Found message we already had, after ${newMessages} .`)
          return true
        }
        console.log(' ... pause ...')
        await delayMs(3000) // ms  give the API a rest
      }
      console.log(`FINISHED 30 CATCHUP SESSIONS. NOT DONE after ${newMessages} new messages `)
      return false
    }

  }

  async function initialize () {
    const solidChannel = chatChannelFromRoom(room, config, archiveBaseURI)
    console.log('    solid channel ' + solidChannel)
    // Make the main chat channel file
    var newChatDoc = solidChannel.doc()
    let already = await rdfLoadIfExists(newChatDoc)
    if (!already) {
      store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)
      store.add(solidChannel, ns.dc('title'), room.name + ' solid-gitter chat archive', newChatDoc)
      await rdfPutResource(newChatDoc)
      console.log('    New chat channel created. ' + solidChannel)
      return false
    } else {
      console.log(`    Chat channel doc ${solidChannel}already existed: ✅`)
      return true
    }
  }

  async function rdfExtendArchiveBack () {
    let m0 = await rdfFirstMessage(solidChannel)
    let d0 = rdfStore.anyValue(m0, ns.dct('created'))
    console.log('Before extension back, earliest message ' + d0)
    var newId = m0.uri.split('#')[1]
   // var newId = await extendBeforeId(id)
    for (let i = 0; i < 30; i++) {
      newId = await gitterExtendBeforeId(newId)
      if (!newId) return null
      console.log(' ... pause ...')
      await delayMs(3000) // ms  give the API a rest
    }
    return newId
  }

  async function gitterStream (store) {
    gitterRoom = gitterRoom || await gitter.rooms.find(room.id)
    var events = gitterRoom.streaming().chatMessages()

   // The 'snapshot' event is emitted once, with the last messages in the room
    events.on('snapshot', function (snapshot) {
      console.log(snapshot.length + ' messages in the snapshot')
    })

   // The 'chatMessages' event is emitted on each new message
    events.on('chatMessages', async function (gitterEvent) {
      console.log('A gitterEvent was ' + gitterEvent.operation)
      console.log('Text: ', gitterEvent.model.text)
      console.log('gitterEvent object: ', JSON.stringify(gitterEvent))
      if (gitterEvent.operation === 'create') {
        var solidMessage = await storeMessage(solidChannel, gitterEvent.model, archiveBaseURI)
        console.log('creating solid message ' + solidMessage)
        var sts = store.connectedStatements(solidMessage)
        try {
          await updater.update([], sts)
          // await saveEverythingBack() // @@ change to patch as much more efficioent
          console.log(`Patched new message ${solidMessage} in `)
        } catch (err) {
          console.error(`Error saving new message ${solidMessage} ` + err)
          throw err
        }
      } else if (gitterEvent.operation === 'remove') {
        console.log('Deleting existing message:')
        await rdfDeleteMessage(solidChannel, gitterEvent.model)
      } else if (gitterEvent.operation === 'update') {
        console.log('Updating existing message:')
        await rdfUpdateMessage(solidChannel, gitterEvent.model)
      } else if (gitterEvent.operation === 'patch') {
        console.log('Ignoring patch')
      } else {
        console.warn('Unhandled gitter event operation: ' + gitterEvent.operation)
      }
    })
    console.log('streaming ...')
  }

  /* Returns earliest id it finds so can be chained
  */
  async function gitterExtendBeforeId (id) {
    console.log(`   Looking for messages before ${id}`)
    gitterRoom = gitterRoom || await gitter.rooms.find(room.id)
    let messages = await gitterRoom.chatMessages({limit: 100, beforeId: id})
    console.log('      found ' + messages.length)
    if (messages.length === 0) {
      console.log('    END OF BACK FILL - UP TO DATE  ====== ')
      return null
    }
    for (let gitterMessage of messages) {
      await storeMessage(solidChannel, gitterMessage, archiveBaseURI)
    }
    await rdfSaveEverythingBack()
    let m1 = await rdfFirstMessage(solidChannel)
    let d1 = rdfStore.anyValue(m1, ns.dct('created'))
    console.log('After extension back, earliest message now ' + d1)

    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]

    return earliest.id
  }
  async function gitterCreate() {
    console.log('First make the solid chat object if necessary:')
    await initialize()
    console.log('Now first catchup  recent messages:')
    var catchupDone = await catchup()
    if (catchupDone) {
      console.log('Initial catchup gave no messages, so no archive necessary.✅')
      return null
    }
    console.log('Now extend the archive back hopefully all the way -- but check:')
    let pickUpFrom = await rdfExtendArchiveBack()
    if (pickUpFrom) {
      console.log('Did NOT go all the way.   More archive sessions will be needed. ⚠️')
    } else {
      console.log('Did go all the way. You have the whole archive to date. ✅')
    }
    return pickUpFrom
  }
  // Body of doRoom
  if (command === 'show') {
    await gitterDoRoomShow()
  } else if (command === 'details') {
      await gitterRoomDetails()
  } else if (command === 'archive') {
    await rdfExtendArchiveBack()
  } else if (command === 'catchup') {
    await catchup()
  } else if (command === 'stream') {
    console.log('catching up to make sure we don\'t miss any when we stream')
    var ok = await catchup()
    if (!ok) {
      console.error('catching up FAILED so NOT starting stream as we would get a gap!')
      throw new Error('Not caught up. Cant stream.')
    }
    console.log('Catchup done. Now set up stream.')
    await gitterStream(store)
  } else if (command === 'init') {
    var already = await initialize()
    // console.log('Solid channel already there:' + already)
  } else if (command === 'create') {
    await gitterCreate()
  }
}

async function loadConfig () {
  let webId;
  let localPod = process.argv[4];
  let remotePod = false;
  if(!localPod){
    remotePod = confirm('Store on remote pod');
    if(!remotePod) {
      localPod =  readlineSync.question('URI to local pod (e.g. file:///home/me/myPod/) : ');
    }
  }
  if( localPod && !remotePod && !localPod.startsWith('http')){
    // if no profile or local Pod found, offer to create them
    console.log('Use local WebId');
    webId = `${localPod.replace(/\/$/,'')}/profile/card#me`
    let profileDoc = ($rdf.sym(webId)).doc()
    let exists
    try {
      console.log(`Looking for ${webId} ...`)
      exists = await auth.fetch(webId)
    } catch{}
    if( !exists || exists.statusText != "OK" ){
      let a=await confirm(`No local webId found at <${localPod}>, create it`);
      if( !a ) {
         console.log("No local pod, exiting ..");
         process.exit();
      }
      else {
        console.log(`Creating serverless pod at ${localPod} ...`);
        await auth.createServerlessPod( localPod );
        console.log('Serverless local pod created for ${webid}');
      }
    }
  }
  else {
    const creds = {
      idp: process.env.SOLID_IDP ,
      username: process.env.SOLID_USERNAME,
      password: process.env.SOLID_PASSWORD
    }
    if(!creds.idp){
      creds.idp = readlineSync.question('Identity Provider (e.g. https://solidcommunity.net) : ')
    }
    if(!creds.username){
      creds.username = readlineSync.question('Pod username : ')
    }
    if(!creds.password){
      creds.password = readlineSync.question('Pod password : ')
    }
    console.log(creds)
    console.log(`Logging into Solid Pod <${creds.idp}>`)
    var session = await auth.login(creds);
    console.log(session)
    webId = session.webId
  }
  const me = $rdf.sym(webId)
  console.log('Logged in to Solid as ' + me)
  var folderConfig = {}
  await fetcher.load(me.doc())
  const prefs = rdfStore.the(me, ns.space('preferencesFile'), null, me.doc())
  console.log('Loading prefs ' + prefs)
  await fetcher.load(prefs)
  console.log('Loaded prefs ✅')

  // Get the config file if it exists
  const SOLIDCONFIGFILE = 'solidGitterConfigurationFile';
  let solidConfig = rdfStore.the(me, ns.solid(SOLIDCONFIGFILE), null, prefs)
  if (!solidConfig) {
    console.log('You don\'t have a solid-gitter configuration. ')
    solidConfig = $rdf.sym(prefs.dir().uri + 'solidGitterConfiguationFile.ttl')
    if (await confirm('Make a solid-gitter config file now in your pod at ' + solidConfig)) {
      console.log('    putting ' + solidConfig)
      await rdfStore.fetcher.webOperation('PUT', solidConfig.uri, {data: '', contentType: 'text/turtle'})
      console.log('    getting ' + solidConfig)
      await rdfStore.fetcher.load(solidConfig)
      await rdfStore.updater.update([], [$rdf.st(me, ns.solid(SOLIDCONFIGFILE), solidConfig, prefs)])
      await rdfStore.updater.update([], [$rdf.st(solidConfig, ns.dct('title'), 'My gitter config file', solidConfig)])
      console.log('Made new solid-gitter config: ' + solidConfig)
    } else {
      console.log('Ok, exiting, no gitter config')
      process.exit(4)
    }
  } else {
    await fetcher.load(solidConfig)
  }

  console.log('Have solid-gitter config ✅')

  const FOLDERS = ['individualChatFolder', 'privateChatFolder', 'publicChatFolder']
  for (let opt of FOLDERS) {
    var x = rdfStore.any(me, ns.solid(opt))
    console.log(` Config option ${opt}: "${x}"`)
    if (x && x.uri) {
      folderConfig[opt] = x.uri
    } else {
      console.log('\nThis must a a full https: or file: URI ending in a slash, which folder on your pod or local file system you want gitter chat stored.')
      x = await readlineSync.question('URI for ' + opt + '? ')
      console.log('@@@@@ aaaaa :' + x)
      if (x.length > 0 && x.endsWith('/')) {
        console.log(`@@ saving config ${opt} =  ${x}`)
        await rdfStore.updater.update([], [$rdf.st(me, ns.solid(opt), $rdf.sym(x), solidConfig)])
        console.log(`saved config ${opt} =  ${x}`)
      } else {
        console.log('abort. exit.')
        process.exit(6)
      }
    }
    folderConfig[opt] = x
  }
  console.log('We have all config data ✅')
  return folderConfig;
  


}

//////////////////////////////////////////////////////////////////
/**
 * This function is the main function that gets called.
 * The comments below will sometimes start with (GITTER) or
 * (MATRIX). This refers to which constant has to be enabled,
 * and thus which api gets used
 * 
 * @returns 
 * 
 * 
 */
async function go () {
  // Start the Matrix or Gitter client
  await init();

  let rooms = []
  var usernameIndex = {}
  var targetRoom;
  var roomsToDo = []

  // (GITTER) Split up rooms
  var oneToOnes = []
  var privateRooms = []
  var publicRooms = []

  // (GITTER) Collect and split up all rooms
  if (GITTER) {
    // 1: Collect all rooms
    console.log(`Logging into gitter room ${targetRoomName} ...`)
    var user
    try {
      user = await gitter.currentUser()
    } catch (err) {
      console.log('Crashed logging into gitter: ' + err)
      process.exit(3)
    }
    console.log('You are logged into gitter as:', user.username)
    rooms = await user.rooms()

    // 2: Split up all rooms
    var roomIndex = {}
    for (let r = 0; r < rooms.length; r++) {
      var room = rooms[r]
      // const oneToOne = room.oneToOne
      // const noun = oneToOne ? 'OneToOne' : 'Room'
      roomIndex[room.name] = room
      if (room.oneToOne) {
        oneToOnes.push(room)
        // console.log('@@@@ remembering ' + '@' + room.user.username)
        usernameIndex[ '@' + room.user.username] = room
      } else {
        if (room.public) {
          publicRooms.push(room)
        } else {
          privateRooms.push(room)
        }
        if (room.name === targetRoomName) {
          console.log('Target room found: ' + room.name)
        }
      }
    }

    // 3: Select which rooms to display
    if (targetRoomName) {
      if (targetRoomName === 'direct') {
        roomsToDo = oneToOnes
      } else if (targetRoomName === 'private') {
        roomsToDo = privateRooms
      } else if (targetRoomName === 'public') {
        roomsToDo = publicRooms
      } else if (targetRoomName === 'all') {
        roomsToDo = oneToOnes.concat(privateRooms).concat(publicRooms)
      } else {
        console.log(`targetRoomName 2 "${targetRoomName}"`)
        console.log('@@@@@@ '  + usernameIndex[targetRoomName])
        targetRoom = targetRoomName.startsWith('@') ? usernameIndex[targetRoomName] : roomIndex[targetRoomName]
        if (targetRoom) {
          roomsToDo = [ targetRoom ]
          console.log('Single room selected: ' + targetRoom.name)
        }
      }

      console.log('targetRoomName 1 ' + targetRoomName)
    }
    
  } else {

    // function (err, data) {
    //     console.log("Public Rooms: %s", JSON.stringify(data));
    // });
  }
  // (MATRIX) Collect all rooms
  if (MATRIX) {
    rooms = setRoomList(matrixClient);
    roomsToDo = rooms;
  }

  console.log('rooms -- ' + rooms.length)
  if (rooms.length < 1) {
    console.error("No rooms were found! Exiting...")
    process.exit(1);
  }

  // Start interface
  /*
  let rl = initReadlineAsync();
  rl.setPrompt("> ");
  rl.on("line", function (line) {})
  */
  //matrixClient.startClient(numMessagesToShow); // messages for each room.


  if (command === 'list') {
    if (GITTER) {
      commandListGitter(oneToOnes, privateRooms, publicRooms);
    }
    if (MATRIX) {
      commandListMatrix();
    }
  }


  console.log('Rooms to do: ' + roomsToDo.length)
  if (roomsToDo.length === 0) {
    console.log(`Room "${targetRoomName}" not found!`)
    console.log(JSON.stringify(usernameIndex))
    process.exit(10)
  }
  

  // Check where to save
  const config = await loadConfig();
  var count = 0

  for (let targetRoom of roomsToDo) {
    try {
      await doRoom(targetRoom, config)
    } catch (err) {
      console.log(`Error processing room ${targetRoom.name}:` + err)
      console.log(` stack` + err.stack)
      process.exit(1)
    }
    count += 1
    if (count %10 === 0) await delayMs(10000) //ms
  }
  if (command !== 'stream') {
    console.log('Done, exiting. ')
    process.exit(0)
  }

  // await saveEverythingBack()
  console.log('ENDS')
} // go

var toBePut = []
var peopleDone = {}
go()

/**
 * Functions used in @see go
 * Naming structure: command{Name}{Platform}
 */
function commandListGitter(oneToOnes, privateRooms, publicRooms) {
  console.log('List of direct one-one chats:')
  for (let r of oneToOnes) {
    var username = r.user.username
    if (!username) throw new Error('one-one must have user username!')
    username = '@' + username
    if (!targetRoomName) {
      console.log(`     ${r.githubType}: ${username}: ${r.name}`)
    }
    if (r.name === targetRoomName || username === targetRoomName) {
      console.log('      Found ' + username)
      console.log(JSON.stringify(r))
      if (room.public) throw new Error('@@@ One-One should not be public!!')
    }
  }
  console.log('List of multi person PRIVATE rooms:')
  for (let r of privateRooms) {
    if (!targetRoomName) {
      console.log(`     ${r.githubType}: ${r.name}  - PRIVATE`)
    }
    if (r.name === targetRoomName) {
      console.log('      found ' + r.name)
      console.log(JSON.stringify(r))
    }
  }
  console.log('List of multi person Public rooms:')
  for (let r of publicRooms) {
    if (!targetRoomName) {
      console.log(`     ${r.githubType}: ${r.name}  - Public`)
    }
    if (r.name === targetRoomName) {
      console.log('      found ' + r.name)
      console.log(JSON.stringify(r))
    }
  }
  process.exit(0) // No more processing for list
}

function commandListMatrix() {
  matrixPrintRoomList();
}

// ends
