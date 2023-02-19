// Gitter or Marix chat data to Solid Chat

import * as sdk from "matrix-js-sdk";// https://github.com/matrix-org/matrix-js-sdk

/*
  The Matrix spec: https://spec.matrix.org/latest/#common-concepts

  The client-server bit of the matrix spec: https://spec.matrix.org/v1.5/client-server-api

  Documentation for the SDK we are using:  https://matrix.org/docs/guides/usage-of-the-matrix-js-sdk
*/

import myCrypto from 'crypto'

import * as dotenv from 'dotenv'
import * as $rdf from 'rdflib'
import solidNamespace from "solid-namespace"
// import * as solidNamespace  from 'solid-namespace'
import * as Gitter from 'node-gitter'
import { SolidNodeClient } from 'solid-node-client'
import * as  readlineSync from 'readline-sync'
import * as readline from 'readline'

const matrixUserId = "@timblbot:matrix.org";
const baseUrl = "http://matrix.org"

const MATRIX_TO_GITTER_MAP = { '!AdIacJniSdsOmHkZjQ:snopyta.org': 'solid/chat' } // https://matrix.to/#/#solid_chat:gitter.im?utm_source=gitter
const MESSAGES_AT_A_TIME = 100
const THREAD_SEARCH_RANGE = 90
const THREAD_LOAD_RANGE= 90
const THREAD_SCAN_RANGE = 365

const THREAD_SEARCH_CLIP_DATE = '2022-12-01' // Don't bother trying to hook up threads past that
dotenv.config()

const command = process.argv[2]
const targetRoomName = process.argv[3]
const userPodBase = process.argv[4]

const GITTER = false
const MATRIX = true

const numMessagesToShow = 20
let matrixClient = null


var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    // completer: completer,
});


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


let gitter, GITTER_TOKEN, MATRIX_PASSWORD

if (GITTER) {
  GITTER_TOKEN = process.env.GITTER_TOKEN
}
if (MATRIX) {
    MATRIX_PASSWORD = process.env.MATRIX_PASSWORD
}
const ns = solidNamespace($rdf)
if (!ns.wf) {
  ns.wf = new $rdf.Namespace('http://www.w3.org/2005/01/wf/flow#') //  @@ sheck why necessary
}

///////////// MATRIX /////////////////


let roomList = []


function getAndSortRoomList() {
    const roomList = matrixClient.getRooms();
    // console.log('   getAndSortRoomList ' + show(roomList))
    roomList.sort(function (a, b) {
        // < 0 = a comes first (lower index) - we want high indexes = newer
        var aMsg = a.timeline[a.timeline.length - 1];
        if (!aMsg) {
            return -1;
        }
        var bMsg = b.timeline[b.timeline.length - 1];
        if (!bMsg) {
            return 1;
        }
        if (aMsg.getTs() > bMsg.getTs()) {
            return 1;
        } else if (aMsg.getTs() < bMsg.getTs()) {
            return -1;
        }
        return 0;
    });
    return roomList
}

function showRoom (room) {
    var msg = room.timeline[room.timeline.length - 1];
    var dateStr = "---";
    if (msg) {
        dateStr = new Date(msg.getTs()).toISOString().replace(/T/, " ").replace(/\..+/, "");
    }
    var myMembership = room.getMyMembership();
    const star = myMembership ? '*' : ' '
    var roomName = room.name
    return `<${room.roomId}> "${roomName}" (${room.getJoinedMembers().length} members)${star}  ${dateStr}`
}

function printRoomList() {
    // console.log(CLEAR_CONSOLE);
    console.log("Room List:");
    for (let i = 0; i < roomList.length; i++) {
        console.log(showRoom(room))
    }
}

function short (x) {
    if (x === null) return 'null'
    if (!x || typeof x !== 'object') return '*';
    if (x.length) return `[${x.length}]`;
    return `{${Object.keys(x).length}}`;
}
function show (x) {
    if (x === null || x === undefined) return ' - '
    const typ = typeof x
    switch (typ) {
        case 'null':
        case 'undefined': return 'x'
        case 'string': return `"${x}"`
        case 'boolean':
        case 'number': return x.toString()
        case  'object':
            if (x.length) return '[' + x.slice(0, 3).map(show).join(', ') + ']'
            return '{' + Object.keys(x).slice(0,3).map(k => ` ${k}: ${short(x[k])}`).join('; ') + '}'

        default: return `Type ${typ} ??`
    }
}


// individualChatFolder', 'privateChatFolder', 'publicChatFolder
function archiveBaseURIFromMatrixRoom (room, config) {
    // console.log('archiveBaseURIFromMatrixRoom ' , config.publicChatFolder.uri)
    return config.publicChatFolder.uri
}

/** Decide URI of solid chat chanel from properties of Matrix room
 *
 * @param room {Room} - like 'solid/chat'
 * https://matrix.to/#/#solid_chat:gitter.im
*/
function chatChannelFromMatrixRoom (room, config) {
    const regexp =  /^.*:gitter\.im$/ ; // These matrix rooms are grandfathered to look like the gitter rooms
    console.log('chatChannelFromMatrixRoom room: ' + showRoom(room))
    let segment
    if (MATRIX_TO_GITTER_MAP[room.roomId]) {
         segment = MATRIX_TO_GITTER_MAP[room.roomId]
         console.log('Mapped matrix gitter to solid as special case: ', segment)
    } else if (room.roomId.endsWith('gitter.im')) {
        if (room.name.match(/^[a-zA-Z0-9-]*\/[a-zA-Z0-9-]*/)) {
            segment = room.name.split('_').join('/')
            console.log('Converted matrix gitter to solid as a/b: ', segment)
       } else {
           throw new Error(`Room ${room.roomId} be a gitterim but name ${room.name} not a/b form`)
       }
    } else if (room.name.match(/[a-zA-Z0-9]*\/[a-zA-Z0-9]*/)) {
    } else {
        const [ name, host ] = room.roomId.split(':')
        segment = host + '/' + encodeURIComponent(name)
    }
    const archiveBaseURI = archiveBaseURIFromMatrixRoom(room, config)
    if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
    const path = archiveBaseURI + segment
    const solidChannel = $rdf.sym(path + '/index.ttl#this')
    console.log(`    chatChannelFromMatrixRoom -> channel ${solidChannel}`)
    return solidChannel
}


async function authorFromMatrix (userData, config) {
    // console.log('   @@@ authorFromMatrix in handleMatrixMessage' , config)
  /* user state looks like
    "avatar_url":"mxc://matrix.org/QGLfsOamRItelTTqJypDlicO",
    "displayname":"Mal Burns",
    "membership":"join"}    <-- relationship to group join or invite (-ed)?
  */
  async function saveMatrixUserData (userData, person, config) {
    const doc = person.doc()
    console.log(`Person "${userData.displayName}" pic <${userData.avatar_url}>`)
    store.add(person, ns.rdf('type'), ns.vcard('Individual'), doc)
    store.add(person, ns.rdf('type'), ns.foaf('Person'), doc)
    store.add(person, ns.vcard('fn'), userData.displayName, doc)
    if (userData.id.endsWith('gitter.im')) {
        const nick = userData.id.split('-')[0] // @@ kludge 'therealimy-60b3548f6da03739847dbe51:gitter.im'
        userData.nick = nick
        const github = 'https://github.com/' + nick // @@ watch out for twitter based folks
        store.add(person, ns.foaf('homepage'), github, doc) // @@ check
        console.log('  Gitter homepage guess ', github)
    }
    store.add(person, ns.foaf('nick'), userData.nick, doc)
    if (userData.avatar_url) {
        const avatarHTTPUrl = matrixClient.mxcUrlToHttp(userData.avatar_url, null, null, null, true) // Don;t get thumbnail
        console.log('    photo "mxc:..." convertd to ', avatarHTTPUrl)
        store.add(person, ns.vcard('photo'), $rdf.sym(avatarHTTPUrl), doc)
    }
    toBePut[doc.uri] = true
  }

  const peopleBaseURI = config.publicUserFolder.uri
  var person = $rdf.sym(peopleBaseURI + encodeURIComponent(userData.id) + '/index.ttl#this') // @@ matrix-
  console.log('     person id: ' + userData.id, userData)
  console.log('     person solid: ' + person)
  if (peopleDone[person.uri]) {
    console.log('    matrix person already saved: ' + person.uri)
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
        await saveMatrixUserData(userData, person, config) // Patch the file into existence
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

/* the main matrix event handler.

For example a replacement rich text message content can look like:

{"body":"* In other new … https://www.wired.com/story/biden-2023-sotu-data-privacy/
  Data Privacy Is Now a Must-Hit US State of the Union Topic",
  "format":"org.matrix.custom.html",
  "formatted_body":"* In other new … <a href=\\"https://www.wired.com/story/biden-2023-sotu-data-privacy/\\" rel=\\"nofollow noopener noreferrer\\" target=\\"_blank\\" class=\\"link \\">https://www.wired.com/story/biden-2023-sotu-data-privacy/</a>  Data Privacy Is Now a Must-Hit US State of the Union Topic",
  "m.new_content":
        {"body":"In other new … https://www.wired.com/story/biden-2023-sotu-data-privacy/  Data Privacy Is Now a Must-Hit US State of the Union Topic",
        "format":"org.matrix.custom.html",
        "formatted_body":"In other new … <a href=\\"https://www.wired.com/story/biden-2023-sotu-data-privacy/\\" rel=\\"nofollow noopener noreferrer\\" target=\\"_blank\\" class=\\"link \\">https://www.wired.com/story/biden-2023-sotu-data-privacy/</a>  Data Privacy Is Now a Must-Hit US State of the Union Topic",
        "msgtype":"m.text"},
     "m.relates_to":{"event_id":"$167631953831IKmeW:gitter.im","rel_type":"m.replace"},
        "msgtype":"m.text"}]

aka

content: {
  body: '* In other new … https://www.wired.com/story/biden-2023-sotu-data-privacy/  Data Privacy Is Now a Must-Hit US State of the Union Topic',
  format: 'org.matrix.custom.html',
  formatted_body: '* In other new … <a href="https://www.wired.com/story/biden-2023-sotu-data-privacy/" rel="nofollow noopener noreferrer" target="_blank" class="link ">https://www.wired.com/story/biden-2023-sotu-data-privacy/</a>  Data Privacy Is Now a Must-Hit US State of the Union Topic',
  'm.new_content': {
    body: 'In other new … https://www.wired.com/story/biden-2023-sotu-data-privacy/  Data Privacy Is Now a Must-Hit US State of the Union Topic',
    format: 'org.matrix.custom.html',
    formatted_body: 'In other new … <a href="https://www.wired.com/story/biden-2023-sotu-data-privacy/" rel="nofollow noopener noreferrer" target="_blank" class="link ">https://www.wired.com/story/biden-2023-sotu-data-privacy/</a>  Data Privacy Is Now a Must-Hit US State of the Union Topic',
    msgtype: 'm.text'
  },
  'm.relates_to': { event_id: '$167631953831IKmeW:gitter.im', rel_type: 'm.replace' },
  msgtype: 'm.text'
},
ev
/* ToDo: Look out for threads. Maybe map to https://www.w3.org/Submission/sioc-spec/#term_reply_of
A new relation type (see [MSC2674](https://github.com/matrix-org/matrix-doc/pull/2674))
`m.thread` expresses that an event belongs to a thread.

```json
"m.relates_to": {
  "rel_type": "m.thread",
  "event_id": "$thread_root"
}
```

*/
function deSigil (eventId) {
    if (eventId === undefined) {
        return  undefined
    }
    if (eventId.startsWith('$')) {
        return eventId.slice(1)
    }
    throw new Error('Matrix event is should hve had a $ ' + eventId)
}

async function saveUniqueValueToRoom (room, predicate, value, config) {
    const chatChannel = chatChannelFromMatrixRoom(room, config)
    const prop = predicate.uri.split('#')[1]
    await store.fetcher.load(chatChannel)
    const old = store.each(chatChannel, predicate, null, chatChannel.doc())
    if (old.length === 1 && old[0].sameTerm(value)) {
        console.log(`     ( ${prop }unchanged)`)
    } else {
        for (const img of old) { // Matrix rooms only hae one avatar at a time
            console.log(`    removing old ${prop}: ${img}`)
            store.remove(chatChannel, predicate, img, chatChannel.doc())
        }
        console.log(`    adding new ${prop}: ${value}`)
        store.add(chatChannel, predicate, value, chatChannel.doc())
        toBePut[chatChannel.doc().uri] = true
    }
}

async function handleMatrixMessage (event, room, config) {
    const userData = {}
    let sender = event.getSender() // like   @timbl:matrix.org
    if (sender.startsWith('@')) sender = sender.slice(1) // strip Sigil [sic]
    // The matrix people add 'gitter-' prefix to a gitter ID when importing ito to matrix.
    // e do NOT need to add when importing Matrix to Solid.
    userData.id = sender // Matrix ID
    userData.nick = sender.split(':')[0]

    //console.log('    @@@ sender: ', sender)
    const name = event.sender ? event.sender.name : event.getSender();
    userData.name = name
    userData.displayName = name

    var time = new Date(event.getTs()).toISOString().replace(/T/, " ").replace(/\..+/, "");
    var body = "";
    const content = event.getContent()
    userData.avatar_url = content.avatar_url

    const eventType = event.getType()
    const eventId = event.event.event_id
    console.log('   Event id ', eventId)
    var text, richText, threadRoot, target
    const isState = event.isState()
    const flag = event.isState() ? 'S' : 'M'

    console.log(`\n<<<< ${flag} [${time}] ${eventType} <${userData.id}> "${name}" ...${eventId.slice(-6)}:-`)

    if (event.event && event.event.redacted_because) {
        console.warn('>>>> Ignoring redacted even because:', event.event.redacted_because)
        return
    }

    const relatesTo = content['m.relates_to']
    if (relatesTo) {
        target = deSigil(relatesTo.event_id)
        const relType = relatesTo.rel_type // m.annotation
        if (relType === 'm.annotation') {
            if (eventType !== 'm.reaction') {
                throw new Error('Why do we have annotation but not on an reaction?')
            } else {

            }
        } else if (relType === 'm.replace') {
            console.log('   This REPLACES ' + target)
            // @@@ code me  .. replaces target
        } else if (relType === 'm.thread') {
            console.log('   This has thread ' + target)
            threadRoot = target
        } else {
            if (relatesTo['m.in_reply_to']) {
                threadRoot = deSigil(relatesTo['m.in_reply_to'].event_id)
                console.log(' Possible thread root 2', threadRoot)
            } else {
                console.log('Relationship with no rel_type or m.in_reply_to', relatesTo)
                throw new Error ('Relationship with no rel_type or m.in_reply_to')
            }
        }
    }

    if (eventType === 'm.reaction') {
        if (relatesTo) {
            const emotion = relatesTo.key // Emoji
            // @@ Add code to put the solid reaction in the chat file  ... see the toolbar in solid chat
            console.log(`Ignoring for now reaction ${emotion} to ${target} by ${sender}`)

        } else {
            console.log('  @reaction event we dont understand:, ', event)
            throw new Error('@@ m.reaction content we dont understand - no relatdeTo')
        }
        // Like {"m.relates_to":{"event_id":"$167611182453162yhMpM:matrix.org","key":"👋","rel_type":"m.annotation"}}


    /////////////////////////////////// State messages
    } else if (event.isState()) {
        console.log('State event')
        // console.log('State event', event)

        userData.avatar_url = content.avatar_url
        if (content.avatar_url && content.avatar_url.startsWith('mxc:')) {
            const avatarHTTPUrl = matrixClient.mxcUrlToHttp(content.avatar_url, null, null, null, true) // Don;t get thumbnail
            console.log('    avatar mxc: converted to ', avatarHTTPUrl)
            userData.avatar_url = avatarHTTPUrl
        }

        if (event.getType() == 'm.room.member') {

            const solidPerson = await authorFromMatrix(userData, config)
            console.log('State: updated ' + solidPerson + ': ', userData)
            console.log('State m.room.member all actions should be done.')

        } else if (event.getType() == 'm.room.name') {
            if (!content.name) throw new Error(' Missing room name:', event)
            await saveUniqueValueToRoom(room, ns.vcard('fn'), content.name, config)

        } else if (event.getType() == 'm.room.avatar') {

            console.log('@@ State m.room.avatar: ' , event)
            if (!content.url) throw new Error(' Missing room avatar:', event)
            const rawAvatar = content.url
            const avatarURL = matrixClient.mxcUrlToHttp(rawAvatar, null, null, null, true)
            const avatar = $rdf.sym(avatarURL)
            const roomId = event.event.room_id
            await saveUniqueValueToRoom(room, ns.vcard('photo'), avatar, config)

        } else {
            console.log('State type unknown: ' + event.getType(), event)
            throw new Error('State type unknown: ' + event.getType())
        }

    } else {
        if (eventType === "m.room.message") {
            if (content.msgtype === 'm.emote') {
                console.log(' Hey -- emote', content)

            } else if (content.msgtype === 'm.text') {
                text = content.body
                if (content.formatted_body) {
                    if (content.format !== 'org.matrix.custom.html') {
                        throw new Error(`Event rich message has format "${content.format}" expected "org.matrix.custom.html"`)
                    }
                    richText = content.formatted_body
                    console.log(' m.room.message contents: ', content)
                }
            } else {
                console.log(` @@ checkout this ${content.msgtype} content`, content)
                console.log(` @@ checkout this ${content.msgtype} event`, event)
                // throw new Error(`Event m.message has message type "${content.msgtype}" expected "m.text"`)
            }
        }

        body = "[Message  type:" + event.getType() + " content: " + JSON.stringify(content) + "]";

        const messageData = { time, sender, body }
        const chatChannel = chatChannelFromMatrixRoom(room, config)

        const gitterMessage = { id: eventId.slice(1), sent: time, fromUser: sender, text, threadRoot  }

        console.log('  Equivalent gitter message ', gitterMessage)
        const archiveBaseURI = archiveBaseURIFromMatrixRoom(room, config)
        const author = await authorFromMatrix(userData, config)
        if (!gitterMessage.text) {
           console.log(`Matrix message: No main text in message.`)
       }
        await storeMessage (chatChannel, gitterMessage, archiveBaseURI, author)
    }
    console.log(`${flag} >>>> [${time}] ${eventType} <${userData.id}> "${name}": ${body.slice(0,80)}`)
}

async function loadRoomMessages (room, config) {
    console.log(`loadRoomMessages: room name ${room.name}`)
    // console.log(show(room))
    const result = await matrixClient.scrollback(room, MESSAGES_AT_A_TIME);
    console.log('  result of scrollback ', show(result))
    var earliestMessage = null
    var latestMessage = null
    var events = 0
    var messages = 0
    const eventTypes = {}
    const timeline = result.timeline;
    for (var i = 0; i < timeline.length; i++) {
        const item = timeline[i]
        const event = item.event
        events += 1
        await handleMatrixMessage(item, room, config);
        console.log(' toBePut length ' + Object.keys(toBePut).length)
    }
    console.log()
    console.log(`Room name ${room.name}`)
    console.log('   Events ', events)
    console.log('   Messages ', messages)
    console.log('   Earliest message ', earliestMessage)
    console.log('   Latest message   ', latestMessage)

    console.log(' toBePut length ' + Object.keys(toBePut).length)
    saveEverythingBack()
    console.log(' toBePut length ' + Object.keys(toBePut).length)
}

function matrixRoomDebug (room) {
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
}

async function processMatrixRoom (room, config) {
    console.log(`\n Room ${showRoom(room)}`)
    const already = await initialize(room, config)
    var myMembership = room.getMyMembership();
    await loadRoomMessages(room, config)
    // await loadRoomMessages(room, config) // what happens if we do it twice?
}

async function processMatrixRooms (config) {
    if (targetRoomName === 'all') {
        for (let i = 0; i < roomList.length; i++) {
            const room = roomList[i]
            processMatrixRoom(room, config)
        }
    } else {
        console.log(`We see ${roomList.length} Matrix rooms`)
        for (let i = 0; i < roomList.length; i++) {
            const room = roomList[i]
            if (targetRoomName === room.name) {
                console.log(` Found room <${room.roomId}> as name "${targetRoomName}"`)
                processMatrixRoom(room, config)
                return;
            } else if (targetRoomName === room.roomId) {
                console.log(` Found room <${room.roomId}> as id "${targetRoomName}"`)
                processMatrixRoom(room, config)
                return;
            }
        }
        console.error(`Error: Target rooom name ${targetRoomName} not found`)
    }
}


async function initialiseMatrix(config) {

    matrixClient = sdk.createClient({ baseUrl: "https://matrix.org/"});
    const response = await matrixClient.login("m.login.password", {"user": "timblbot", "password": MATRIX_PASSWORD})
    console.log('  login returned', response);

    console.log(' New matrix client with base ', baseUrl)
    // const response = matrixClient.login("m.login.password", {"user": "timblbot", "password": MATRIX_PASSWORD})
    const accessToken = response.access_token
    // if (!accessToken) throw new Error('No access token from matrix')
    // .then((response) => { console.log(response.access_token);});

    const client = matrixClient
    await client.startClient({ initialSyncLimit: 10 });


    client.once("sync", async function (state, prevState, res) {
      if (state === "PREPARED") {
          console.log("prepared");
          await processMatrixRooms(config)
          console.log(` to be put back: ${Object.keys(toBePut).length}`)
          await saveEverythingBack()
          console.log(` should be all put back: ${Object.keys(toBePut).length}`)
      } else {
          console.log('Fatal Error:  state not prepared: ' + state);
          // console.log(state);
          process.exit(1);
      }
  });

  matrixClient.startClient(numMessagesToShow); // messages for each room.

  roomList = matrixClient.getRooms();

  console.log('getRooms  ' + JSON.stringify(roomList)) //


  matrixClient.on("Room", function () {
      roomList = getAndSortRoomList();
      // console.log('on Room room list: ' + roomList.length + ' rooms')
  });
 }


////////////////////////////////////// End of matrix

async function init() {
  if(!command) {
    command = await readlineSync.question('Command (e.g. create) : ');
  }
  if(!targetRoomName) {
    targetRoomName = await readlineSync.question('Gitter Room (e.g. solid/chat) : ');
  }
  if (GITTER) {
    if (!GITTER_TOKEN) {
      GITTER_TOKEN = await readlineSync.question('Gitter Token : ');
    }
    gitter = new Gitter(GITTER_TOKEN)

  }
  if (MATRIX) {
    const config = await(loadConfig())
    await initialiseMatrix(config)
  }
}

async function confirm (q) {
  while (1) {
    var a = (await readlineSync.question(q+' (y/n)? ')).trim().toLowerCase();
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
const kb = store // shorthand -- knowledge base
const fetcher = $rdf.fetcher(kb, fetcherOpts)
const updater = new $rdf.UpdateManager(kb)

function delayMs (ms) {
  console.log('pause ... ')
  return new Promise(resolve => setTimeout(resolve, ms))
}

function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

// individualChatFolder', 'privateChatFolder', 'publicChatFolder
function archiveBaseURIFromGitterRoom (room, config) {
  // const folder = room.oneToOne ? config.individualChatFolder
  //         : room.public ? config.publicChatFolder : config.privateChatFolder
  // return (folder.uri) ? folder.uri : folder // needed if config newly created

  return config.publicChatFolder // @@ Those are the only things we are really wit ATM but change later!!!
}

/** Decide URI of solid chat chanel from properties of gitter room
 *
 * @param room {Room} - like 'solid/chat'
*/
function chatChannelFromGitterRoom (room, config) {
  var path
  let segment = room.name.split('/').map(encodeURIComponent).join('/') // Preseeve the slash begween org and room
  if (room.githubType === 'ORG') {
    segment += '/_Organization' // make all multi rooms two level names
  }
  var archiveBaseURI = archiveBaseURIFromGitterRoom(room, config)
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

async function putResource (doc) {
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fetcher in future
  return fetcher.putBack(doc, clone(normalOptions))
}

async function loadIfExists (doc) {
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

async function firstMessage (chatChannel, backwards) { // backwards -> last message
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

async function saveEverythingBack () {
  // console.log('Saving all modified files:')
  for (let uri in toBePut) {
    if (toBePut.hasOwnProperty(uri)) {
      console.log('Putting ' + uri)
      await putResource($rdf.sym(uri))
      delete fetcher.requested[uri] // invalidate read cache @@ should be done by fether in future
    }
  }
  // console.log('Saved all modified files.')
  toBePut = []
}

///////////////// GITTER ONLY

async function authorFromGitter (fromUser, archiveBaseURI) {
    console.log('authorFromGitter', )
  /* fromUser looks like
    "id": "53307734c3599d1de448e192",
    "username": "malditogeek",
    "displayName": "Mauro Pompilio",
    "url": "/malditogeek",     meaning https://github.com/malditogeek
    "avatarUrlSmall": "https://avatars.githubusercontent.com/u/14751?",
    "avatarUrlMedium": "https://avatars.githubusercontent.com/u/14751?"
  */
  async function saveGitterUserData (fromUser, person) {
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
    // console.log('    gitter person already saved ' + fromUser.username)
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
        await saveGitterUserData(fromUser, person) // Patch the file into existence
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


/* Chat file for previous day
*/

function previousDay (chatFile) {
    // ends  say 2023/04/03/chat.ttl
    const segments = chatFile.uri.split('/')
    // console.log(` previousDay  @@ segments ${segments} `)
    const date = new Date(segments.slice(-4,-1).join('-') + 'T12:00Z')
    // console.log(` previousDay  @@ date ${date} `)
    const prevDateObject = new Date(date.getTime() - 24*60*60*1000);
    // console.log(` previousDay  @@ prevDateObject ${prevDateObject} `)
    const prevDate = prevDateObject.toISOString().split('T')[0]
    // console.log(` previousDay  @@ prevDateObject ${prevDateObject}  yesterday ${prevDate}  `)
    const prevSegs = prevDate.split('-').join('/')
    const prevDayChannel = segments.slice(0, -4).join('/') + '/' + prevSegs + '/' + segments.slice(-1).join('/')
    const prevChatFile = $rdf.sym(prevDayChannel)
    // console.log(`   @@ previousDay  prevChatFile ${prevChatFile}`)
    return prevChatFile
}

function matrixURFromEventId (eventId) {
    if (eventId.startsWith('$')) {
        throw new Error('Should not have initial $' + eventId)
    }
    return $rdf.sym('matrix:///e/' + eventId)
}

/* Find which chat file has a message with a given ID
*
* The root for the thread will always be in the past compared with
* the messagwe in the thread, but that past may not yet be in the web
* if we  are working backwards.
* Note that when looking for the HTTP URL of the thread root,
* We can find evidence of it in any other thing that refers to it
*
See also https://github.com/SolidOS/chat-pane/issues/4
*/
async function findThreadRoot (currentMessage, thread) {
    const matrixURI = matrixURFromEventId(thread)
    console.log(`findThreadRoot ${currentMessage}, ${thread} -> ${matrixURI}`)

    if (thread.startsWith('$')) {
        throw new Error('Sigil should have been removed from: ' + thread)
    }
    const threadFromId = store.any(null, ns.sioc('id'), matrixURI)
    if (threadFromId) {
        console.log(' Found thread from ID 🎉 at ' + threadFromId)
        return threadFromId
    }
    let possible = $rdf.sym(currentMessage.doc().uri + '#' + thread)
    if (store.connectedStatements(possible).length > 0) {
        console.log(' Found thread root same day 🎉 at ' + possible)
        return  possible
    }
    let loading = possible // scan backwards

    for (let i=0; i < THREAD_LOAD_RANGE; i++) {
        loading = previousDay(loading)
        let exists  = await loadIfExists(loading)
        if (exists) { // new data
            let scanning = possible
            for (let j=0; i < THREAD_SCAN_RANGE; i++) {

                if (store.connectedStatements(scanning).length > 0) { // any mentio  in any doc
                    console.log(' Found past thread root 🎉 at ' + scanning)
                    // console.log('Connected statements', store.connectedStatements(scanning))
                    return  scanning
                }

            }
        }
    }
    console.warn('Did not find thread root ', possible)
    return null
}

/**  Convert gitter message to Solid
 *
*/
// See https://developer.gitter.im/docs/messages-resource

var newMessages = 0
var oldMessages = 0

async function storeMessage (chatChannel, gitterMessage, archiveBaseURI, author) {
  console.log(`  storeMessage gitterMessage `, gitterMessage)
  var sent = new Date(gitterMessage.sent) // Like "2014-03-25T11:51:32.289Z"
  // console.log('        Message sent on date ' + sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + gitterMessage.id) // like "53316dc47bfc1a000000000f"
  // console.log('          Solid Message  ' + message)

  await loadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
    // console.log(`  already got ${gitterMessage.sent} message ${message}`)
    oldMessages += 1
    console.log(`storeMessage: Got message already.`)
    return // alraedy got it
  }
  newMessages += 1

  store.add(chatChannel, ns.wf('message'), message, chatDocument)
  if (gitterMessage.text) {
      store.add(message, ns.sioc('content'), gitterMessage.text, chatDocument)
  } else {
      console.log(`storeMessage: No main text in message.`)
  }
  if (gitterMessage.richText && gitterMessage.richText !== gitterMessage.text) { // is it new information?
    store.add(message, ns.sioc('richContent'), gitterMessage.richText, chatDocument) // @@ predicate??
  }
  store.add(message, ns.dct('created'), sent, chatDocument)
  if (gitterMessage.edited) {
    store.add(message, ns.dct('modified'), new Date(gitterMessage.edited), chatDocument)
  }
  if (gitterMessage.threadRoot) {

      // Try using SIOC threads with matrix URIs
      const urn = $rdf.sym('matrix:///e/' + gitterMessage.threadRoot.slice(1))
      store.add(message, ns.sioc('has_container'), urn, chatDocument)
      store.add(urn, ns.rdf('type'), ns.sioc('Thread'), chatDocument)
      console.log(`storeMessage: thread ${gitterMessage.threadRoot} -> ${urn} `)

      // Link it in the web if we can find it
      const threadRootMessage = await findThreadRoot(message, gitterMessage.threadRoot)
      console.log('storeMessage: threadRootMessage: ' +  threadRootMessage)
      if (threadRootMessage) {
          store.add(message, ns.sioc('reply_of'), threadRootMessage, chatDocument) // @@ predicate??
          if (!message.doc().sameTerm(threadRootMessage.doc())) { // double link
              await store.fetcher.load(threadRootMessage.doc())
              store.add(message, ns.sioc('reply_of'), threadRootMessage, threadRootMessage.doc())
              toBePut[threadRootMessage.doc().uri]
              console.log(`   Double linking  ${message} and ${threadRootMessage} ✅`)
          }
      } else {
          console.warn('Could not find Solid message thread correponding to ' + gitterMessage.threadRoot)
          store.add(message, ns.sioc('reply_of'), urn, chatDocument) // @@ predicate??
      }
  }
  store.add(message, ns.foaf('maker'), author, chatDocument)
  // if (!toBePut[chatDocument.uri]) console.log('   Queueing to write  ' + chatDocument)
  toBePut[chatDocument.uri] = true
  return message
}

/** Update message friomn update operation
*
*
  Input payload Like   {"operation":"update","model":{
"id":"5c97d7ed5547f774485bbf05",
"text":"The quick red fox",
"html":"The quick red fox","sent":"2019-03-24T19:18:05.278Z","editedAt":"2019-03-24T19:18:12.757Z","fromUser":{"id":"54d26c98db8155e6700f7312","username":"timbl","displayName":"Tim Berners-Lee","url":"/timbl","avatarUrl":"https://avatars-02.gitter.im/gh/uv/4/timbl","avatarUrlSmall":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=60","avatarUrlMedium":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=128","v":30,"gv":"4"},"unread":true,"readBy":3,"urls":[],"mentions":[],"issues":[],"meta":[],"v":2}}
*/
async function updateMessage (chatChannel, payload) {
  var sent = new Date(payload.sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await loadIfExists(chatDocument)
  var found = store.any(message, ns.sioc('content'))
  if (!found) {
    console.error('DID NOT FIND MESSAGE TO UPDATE ' + payload.id)
    return
  }

  console.log(`Updating  ${payload.sent} message ${message}`)

  var del = []
  var ins = []
  if (payload.text) {
    let oldText = kb.the(message, ns.sioc('content'))
    if (oldText && payload.text === oldText) {
      console.log(` text unchanged as <${oldText}>`)
    } else {
      del.push($rdf.st(message, ns.sioc('content'), oldText, chatDocument))
      ins.push($rdf.st(message, ns.sioc('content'), payload.text, chatDocument))
    }
  }
  if (payload.html) {
    let oldText = kb.the(message, ns.sioc('richContent'))
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

async function deleteMessage (chatChannel, payload) {
  var chatDocument = chatDocumentFromDate(chatChannel, new Date()) // @@ guess now
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await loadIfExists(chatDocument)
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

async function initialize (room, config) {
  const solidChannel = chatChannelFromMatrixRoom(room, config)
  console.log('    solid channel ' + solidChannel)
  // Make the main chat channel file
  var newChatDoc = solidChannel.doc()
  let already = await loadIfExists(newChatDoc)
  if (!already) {
    store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)
    store.add(solidChannel, ns.dc('title'), room.name + ' matrix chat archive', newChatDoc)
    await putResource(newChatDoc)
    console.log('    New chat channel created. ' + solidChannel)
    return false
  } else {
    console.log(`    Chat channel doc ${solidChannel} already existed: ✅`)
    return true
  }
}


/// /////////////////////////////  Do Gitter Room

async function doRoom (room, config) {
  console.log(`\nDoing room ${room.id}:  ${room.name}`)
  // console.log('@@ bare room: ' + JSON.stringify(room))
  var gitterRoom
  const solidChannel = chatChannelFromGitterRoom(room, config)
  const archiveBaseURI = archiveBaseURIFromGitterRoom(room, config)

  console.log('    solid channel ' + solidChannel)

  function findEarliestId (messages) {
    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    if (sortMe.length === 0) return null
    sortMe.sort()
    const earliest = sortMe[0][1]
    return earliest.id
  }

  async function show () {
    let name = room.oneToOne ? '@' + room.user.username : room.name
    console.log(`     ${room.githubType}: ${name}`)
  }

  async function details () {
    let name = room.oneToOne ? '@' + room.user.username : room.name
    console.log(`${room.githubType}: ${name}`)
    console.log(JSON.stringify(room))
  }

  async function catchup () {
    newMessages = 0
    oldMessages = 0
    gitterRoom = gitterRoom || await gitter.rooms.find(room.id)
    var messages = await gitterRoom.chatMessages() // @@@@ ?
    if (messages.length !== 50) console.log('  Messages read: ' + messages.length)
    for (let gitterMessage of messages) {
        const author = await authorFromGitter(gitterMessage.fromUser, archiveBaseURI)

        await storeMessage(solidChannel, gitterMessage, archiveBaseURI, author)
    }
    await saveEverythingBack()
    if (oldMessages) {
      console.log('End catchup. Found message we already had.')
      return true
    }
    var newId = findEarliestId(messages)
    if (!newId) {
      console.log('Catchup found no gitter messages.')
      return true
    }
    for (let i = 0; i < 30; i++) {
      newId = await extendBeforeId(newId)
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

  async function extendArchiveBack () {
    let m0 = await firstMessage(solidChannel)
    let d0 = kb.anyValue(m0, ns.dct('created'))
    console.log('Before extension back, earliest message ' + d0)
    var newId = m0.uri.split('#')[1]
   // var newId = await extendBeforeId(id)
    for (let i = 0; i < 30; i++) {
      newId = await extendBeforeId(newId)
      if (!newId) return null
      console.log(' ... pause ...')
      await delayMs(3000) // ms  give the API a rest
    }
    return newId
  }

  async function stream (store) {
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
        var author = await authorFromGitter(gitterMessage.fromUser, archiveBaseURI)
        var solidMessage = await storeMessage(solidChannel, gitterEvent.model, archiveBaseURI, author)
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
        await deleteMessage(solidChannel, gitterEvent.model)
      } else if (gitterEvent.operation === 'update') {
        console.log('Updating existing message:')
        await updateMessage(solidChannel, gitterEvent.model)
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
  async function extendBeforeId (id) {
    console.log(`   Looking for messages before ${id}`)
    gitterRoom = gitterRoom || await gitter.rooms.find(room.id)
    let messages = await gitterRoom.chatMessages({limit: 100, beforeId: id})
    console.log('      found ' + messages.length)
    if (messages.length === 0) {
      console.log('    END OF BACK FILL - UP TO DATE  ====== ')
      return null
    }
    for (let gitterMessage of messages) {
        const author = await authorFromGitter(gitterMessage.fromUser, archiveBaseURI)
        await storeMessage(solidChannel, gitterMessage, archiveBaseURI, author)
    }
    await saveEverythingBack()
    let m1 = await firstMessage(solidChannel)
    let d1 = kb.anyValue(m1, ns.dct('created'))
    console.log('After extension back, earliest message now ' + d1)

    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]

    return earliest.id
  }
  async function create() {
    console.log('First make the solid chat object if necessary:')
    await initialize(room, config)
    console.log('Now first catchup  recent messages:')
    var catchupDone = await catchup()
    if (catchupDone) {
      console.log('Initial catchup gave no messages, so no archive necessary.✅')
      return null
    }
    console.log('Now extend the archive back hopefully all the way -- but check:')
    let pickUpFrom = await extendArchiveBack()
    if (pickUpFrom) {
      console.log('Did NOT go all the way.   More archive sessions will be needed. ⚠️')
    } else {
      console.log('Did go all the way. You have the whole archive to date. ✅')
    }
    return pickUpFrom
  }
  // Body of doRoom
  if (command === 'show') {
    await show()
  } else if (command === 'details') {
      await details()
  } else if (command === 'archive') {
    await extendArchiveBack()
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
    await stream(store)
  } else if (command === 'init') {
    var already = await initialize(room, config)
    // console.log('Solid channel already there:' + already)
  } else if (command === 'create') {
    await create()
  }
}

async function loadConfig () {
  let webId;
  let localPod = process.argv[4];
  let remotePod = false;
  if(!localPod){
    remotePod = await confirm('Store on remote pod');
    if(!remotePod) {
      localPod =  await readlineSync.question('URI to local pod (e.g. file:///home/me/myPod/) : ');
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
      const idp = await readlineSync.question('Identity Provider (e.g. https://solidcommunity.net) : ')
    }
    if(!creds.username){
      const username = await readlineSync.question('Pod username : ')
    }
    if(!creds.password){
      const password = await readlineSync.question('Pod password : ')
    }
    console.log(`Logging into Solid Pod <${creds.idp}>`)
    var session = await auth.login(creds);
    webId = session.webId
  }
  const me = $rdf.sym(webId)
  console.log('Logged in to Solid as ' + me)
  var gitterConfig = {}
  await fetcher.load(me.doc())
  const prefs = kb.the(me, ns.space('preferencesFile'), null, me.doc())
  console.log('Loading prefs ' + prefs)
  await fetcher.load(prefs)
  console.log('Loaded prefs ✅')

  var config = kb.the(me, ns.solid('gitterConfiguationFile'), null, prefs)
  if (!config) {
    console.log('You don\'t have a gitter configuration. ')
    config = $rdf.sym(prefs.dir().uri + 'gitterConfiguration.ttl')
    if (await confirm('Make a gitter config file now in your pod at ' + config)) {
      console.log('    putting ' + config)
      await kb.fetcher.webOperation('PUT', config.uri, {data: '', contentType: 'text/turtle'})
      console.log('    getting ' + config)
      await kb.fetcher.load(config)
      await kb.updater.update([], [$rdf.st(me, ns.solid('gitterConfiguationFile'), config, prefs)])
      await kb.updater.update([], [$rdf.st(config, ns.dct('title'), 'My gitter config file', config)])
      console.log('Made new gitter config: ' + config)
    } else {
      console.log('Ok, exiting, no gitter config')
      process.exit(4)
    }
  } else {
    await fetcher.load(config)
  }
  console.log('Have gitter config ✅')

  for (let opt of opts) {
    var x = kb.any(me, ns.solid(opt))
    console.log(` Config option ${opt}: "${x}"`)
    if (x && x.uri) {
      gitterConfig[opt] = x.uri
    } else {
      console.log('\nThis must a a full https: or file: URI ending in a slash, which folder on your pod or local file system you want gitter chat stored.')
      x = await readlineSync.question('URI for ' + opt + '? ')
      console.log('@@@@@ aaaaa :' + x)
      if (x.length > 0 && x.endsWith('/')) {
        console.log(`@@ saving config ${opt} =  ${x}`)
        await kb.updater.update([], [$rdf.st(me, ns.solid(opt), $rdf.sym(x), config)])
        console.log(`saved config ${opt} =  ${x}`)
      } else {
        console.log('abort. exit.')
        process.exit(6)
      }
    }
    gitterConfig[opt] = x
  }
  // console.log(`Import config data:`, gitterConfig)
  console.log('We have all config data ✅')
  return gitterConfig
}

//////////////////////////////////////////////////////////////////
async function go () {
  await init();
  var oneToOnes = []
  var privateRooms = []
  var publicRooms = []
  var usernameIndex = {}
  let rooms = []
  if (GITTER) {
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

} else if (MATRIX) {

    rl.setPrompt("> ");
    rl.on("line", function (line) {})
    matrixClient.startClient(numMessagesToShow); // messages for each room.
}
   //// if (targetRoomName === 'all') { }

  console.log('rooms ' + rooms.length)

  return

  console.log('@ testing exit ')
  process.exit()

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
  if (command === 'list') {
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

  var targetRoom
  var roomsToDo = []
  console.log('targetRoomName 1 ' + targetRoomName)

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
  }

  if (roomsToDo.length === 0) {
    console.log(`Room "${targetRoomName}" not found!`)
    console.log(JSON.stringify(usernameIndex))
    process.exit(10)
  }
  console.log('Rooms to do: ' + roomsToDo.length)
  const config = await loadConfig()
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
const opts = ['individualChatFolder', 'privateChatFolder', 'publicChatFolder', 'publicUserFolder']
go()

// ends
