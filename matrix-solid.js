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
const MESSAGES_AT_A_TIME = 100 // 3000?
const THREAD_SEARCH_RANGE = 90
const THREAD_LOAD_RANGE= 90
const THREAD_SCAN_RANGE = 365

const THREAD_SEARCH_CLIP_DATE = '2022-12-01' // Don't bother trying to hook up threads past that
const MESSAGE_LOAD_CLIP = '2023-02-14' // Don't load anything  before this
const MAX_SCROLLS = 100
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

/// should share with this solid-ui/src/chat/messageTools.

/* Emoji in Unicode

See https://www.unicode.org/emoji/charts/full-emoji-modifiers.html

More specfic types -- https://schema.org/ReactAction
        AgreeAction
        DisagreeAction
        DislikeAction  @@
        EndorseAction
        LikeAction
        WantAction  @@
*/

const emojiMap = {}
emojiMap[ns.schema('AgreeAction')] = '👍️' // What about skin variations ??! @@ https://www.unicode.org/emoji/charts/full-emoji-modifiers.html
emojiMap[ns.schema('DisagreeAction')] = '👎'
emojiMap[ns.schema('EndorseAction')] = '⭐️'
emojiMap[ns.schema('LikeAction')] = '❤️'

export function emojiFromActionClass (action) {
  return emojiMap[action] || null
}

export function ActionClassFromEmoji (emoji) {
  for (const a in emojiMap) {

      if (emojiMap[a] === emoji) {
          console.log(` ActionClassFromEmoji success ${emoji} -> ${a}`)
          return $rdf.sym(a.slice(1, -1)) // remove < >
      }
  }
  console.log(' ActionClassFromEmoji fail ${emoji}' )

  return null
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
    for (const room of roomList) {
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
        if (room.name.match(/^[a-zA-Z0-9_-]*\/[a-zA-Z0-9_-]*/)) { // already as a/b
            segment = room.name // like linkeddata/MasterCard_workshop
        } else if (room.name.match(/^[a-zA-Z0-9-]*_[a-zA-Z_0-9-]*/)) { // a_b
            segment = room.name.split('_').join('/')
            console.log('Converted matrix gitter to solid as a/b: ', segment)
       } else {
           throw new Error(`Room ${room.roomId} be a gitterim but name ${room.name} not a/b form`)
       }
    } else if (room.name.match(/[a-zA-Z0-9]*\/[a-zA-Z0-9]*/)) {
    } else {
        const [ sigilled, host ] = room.roomId.split(':')
        const name = sigilled.slice(1) // remove the '!' for the room
        segment = host + '/' + encodeURIComponent(name)
    }
    const archiveBaseURI = archiveBaseURIFromMatrixRoom(room, config)
    if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
    const path = archiveBaseURI + segment
    const solidChannel = $rdf.sym(path + '/index.ttl#this')
    console.log(`    chatChannelFromMatrixRoom -> channel ${solidChannel}`)
    return solidChannel
}

function userFromMatrixId (id, config) {
    const peopleBaseURI = config.publicUserFolder.uri
    return $rdf.sym(peopleBaseURI + encodeURIComponent(id) + '/index.ttl#this')
}

async function authorFromMatrix (userData, config) {
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
  //var person = $rdf.sym(peopleBaseURI + encodeURIComponent(userData.id) + '/index.ttl#this') // @@ matrix-
  const person = userFromMatrixId(userData.id, config)
  console.log(`  person id: ${userData.id} -> solid ${person}`)

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


/* Convert internal self-identifying Id into matrix: URI

See https://spec.matrix.org/v1.6/appendices/#matrix-uri-scheme

But see https://spec.matrix.org/v1.6/appendices/#common-identifier-format
for the sigils which also include '+'

URNs like matrix: URIs are generally less useful than HTTP URIs.
*/

function toMatrixThing (id) {
    const map = {
        '@': 'u',
        '$': 'e',
        '!': 'room',
        '#': 'r'
    }
    if (!map[id[0]]) {
        throw new Error('toMatrixThing: Unknown Matrix Sigil ' + id)
    }
    return 'matrix:///' + map[id[0]] + '/' + id.slice(1)
}

function deSigil (eventId) {
    if (eventId === undefined) {
        return  undefined
    }
    if (eventId.startsWith('$')) {
        return eventId.slice(1)
    }
    throw new Error('Matrix event is should hve had a $ ' + eventId)
}

async function saveUniqueValueToChannel (chatChannel, predicate, value, config) {
    const prop = predicate.uri.split('#')[1]
    await store.fetcher.load(chatChannel)
    /*
    const old = store.each(chatChannel, predicate, null, chatChannel.doc())
    if (old.length === 1 && old[0].sameTerm(value)) {
        console.log(`     ( ${prop }unchanged)`)
    } else {
        for (const img of old) { // Matrix rooms only hae one avatar at a time
            console.log(`    removing old ${prop}: ${img}`)
            store.remove(chatChannel, predicate, img, chatChannel.doc())
        }*/
    console.log(`    Adding room state to channel  ${prop}: ${value}`)
    store.add(chatChannel, predicate, value, chatChannel.doc())
    toBePut[chatChannel.doc().uri] = true
}

function timeOfEvent(event) {
    return new Date(event.getTs()).toISOString().replace(/T/, " ").replace(/\..+/, "");
}

function getRichText (content) {
    if (content.formatted_body) {
        if (content.format !== 'org.matrix.custom.html') {
            throw new Error(`Event rich message has format "${content.format}" expected "org.matrix.custom.html"`)
        }
        // console.log(' m.room.message contents: ', content)
        return content.formatted_body
    }
    return undefined
}
/*              Handle one Matrix Message
*/
async function handleMatrixMessage (event, room, chatChannel, config) {
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
    console.log('\n   Event id ', eventId)

    // MessageData: { text, richText, replyTo, threadRoot, target, isEmotion, replaces, metadata }
    const messageData = { sender, time, id: eventId }

    const isState = event.isState()
    const flag = event.isState() ? 'S' : 'M'

    console.log(`<< ${flag} [${time}] ${eventType} <${userData.id}> "${name}" ... ${eventId.slice(-10)}:-`)

    if (event.event && event.event.redacted_because) {
        console.log('> Note REDACTED event because:', event.event.redacted_because)
        console.log(`   Redacted event isState: ${isState}`)
        messageData.text = '<redacted>' // fill
        // Redacted events don'y have msgType
        // return time
    }

    // Found a case where a thread rel was just misssung fomr the getContrnt() version
    const relatesTo = content['m.relates_to'] || event.event.content['m.relates_to']
    if (relatesTo) {
        messageData.target = deSigil(relatesTo.event_id)
        const relType = relatesTo.rel_type // m.annotation
        if (relType === 'm.annotation') {
            if (eventType !== 'm.reaction') {
                throw new Error('Why do we have annotation but not on an reaction?')
            } else {

            }
        } else if (relType === 'm.replace') { // https://spec.matrix.org/v1.6/client-server-api/#event-replacements
            /* The original event must not, itself, have a rel_type of m.replace
            (i.e. you cannot edit an edit — though you can send multiple edits for a single original event). */
            console.log('   This REPLACES ' + messageData.target)
            messageData.replaces = messageData.target
            // @@@ code me  .. replaces target -> dct:isReplacedBy
        } else if (relType === 'm.thread') {
            console.log('   This has thread ' + messageData.target)
            messageData.threadRoot = messageData.target
        } else {
            if (relatesTo['m.in_reply_to']) {
                messageData.replyTo = deSigil(relatesTo['m.in_reply_to'].event_id)
                console.log(' Straight reply (no thread)' + messageData.replyTo)
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
            console.log(`Storing m.reaction ${emotion} to ${messageData.target} by ${sender}`)
            const action = { reactionId: eventId, sender, time, target:messageData.target, content:emotion, senderId:sender }
            await storeAction(action, config)
            /* Should be saved like
                <#id1678102306625> <http://schema.org/agent> <https://timbl.inrupt.net/profile/card#me>;
                a <http://schema.org/AgreeAction>;
                <http://schema.org/target> <#Msg1677678647433>.
            */
          } else if (event.event && event.event.redacted_because){
            console.log('  Redacted m.reaction ' + eventId)
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

        if (eventType === 'm.room.canonical_alias') {
            const alias = toMatrixThing(content.alias)
            await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `canonical alias: ${alias}.`, config) // Eg public
        } else if (eventType === 'm.room.topic') {
            await saveUniqueValueToChannel(chatChannel, ns.dct('title'), content.topic, config) // Eg public
        } else if (eventType === 'm.room.history_visibility') {
            await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `history_visibility: ${content.history_visibility}.`, config) // Eg public
        } else if (eventType === 'm.room.encryption') {
            await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `Encryption: algorithm: ${content.algorithm}.`, config) // eg 'm.megolm.v1.aes-sha2'
        } else if (eventType === 'm.room.guest_access') {
              await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `Guest_access: ${content.guest_access}.`, config) // Eg can_join
        } else if (eventType === 'm.room.join_rules') {
              await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `Join rules: ${content.join_rules}.`, config) // Eg public
        } else if (eventType === 'm.room.create') {
            if (content.origin_server_ts) {
                const created = new Date(0 + content.origin_server_ts)
                console.log(`  Room creation date "${content.origin_server_ts}" -> ${created}`)
                await saveUniqueValueToChannel(chatChannel, ns.dct('created'), created, config)
            }

            const creator = toMatrixThing(content.creator)
            await saveUniqueValueToChannel(chatChannel, ns.dct('creator'), creator, config)

            if (content.room_version) {
                await saveUniqueValueToChannel(chatChannel, ns.rdfs('comment'), `Room version: ${content.room_version}`, config)
            }
        } else if (eventType === 'm.room.member') {

            const solidPerson = await authorFromMatrix(userData, config)
            console.log('State: updated ' + solidPerson + ': ', userData)
            console.log('State m.room.member all actions should be done.')

        } else if (eventType == 'm.room.name') {
            if (!content.name) throw new Error(' Missing room name:', event)
            await saveUniqueValueToChannel(chatChannel, ns.vcard('fn'), content.name, config)

        } else if (eventType === 'm.room.avatar') {

            console.log('@@ State m.room.avatar: ' , event)
            if (!content.url) throw new Error(' Missing room avatar:', event)
            const rawAvatar = content.url
            const avatarURL = matrixClient.mxcUrlToHttp(rawAvatar, null, null, null, true)
            const avatar = $rdf.sym(avatarURL)
            const roomId = event.event.room_id
            await saveUniqueValueToChannel(chatChannel, ns.vcard('photo'), avatar, config)

        } else if (eventType === 'im.gitter.project_association') {
            // A gitter extension to link to github
            if (content.type === 'GH_ORG') {
                // like   externalId: null, linkPath: 'rdfjs', platform: 'github.com', type: 'GH_ORG'
                const repoURI = `https://${content.platform}/${content.linkPath}/`
                console.log(`  Got related Githb Organization ${repoURI} 👍`)
                await saveUniqueValueToChannel(chatChannel, ns.foaf('homepage'), $rdf.sym(repoURI), config)
            } else if (content.type === 'GH_REPO') {
                //   like: { externalId: '58017436', linkPath: 'solid/mashlib', platform: 'github.com',type: 'GH_REPO'},
                const repoURI = `https://${content.platform}/${content.linkPath}/`
                console.log(`  Got related Githb repo ${repoURI} 👍`)
                await saveUniqueValueToChannel(chatChannel, ns.doap('repository'), $rdf.sym(repoURI), config)
            } else if (content.type === 'GL_PROJECT') {
                const repoURI = `https://${content.platform}/${content.linkPath}/`
                await saveUniqueValueToChannel(chatChannel, ns.foaf('homepage'), $rdf.sym(repoURI), config)
                // externalId: '7527683', linkPath: 'gitlab-org/gitter/node-gitter', platform: 'gitlab.com', type: 'GL_PROJECT'
            } else {
                console.log('@@ Dont understand project_association content', content)
                throw new Error('Gitter project_association has unnown type: ' + content.type)
            }

        } else if (eventType === 'org.matrix.msc3946.room_predecessor' || eventType === 'org.matrix.room_predecessor') {
            if (!content.predecessor_room_id) throw new Error('predecessor_room_id with no predecessor_room_id')
            await saveUniqueValueToChannel(chatChannel, ns.schema('successorOf'), toMatrixThing(content.predecessor_room_id), config) // @@ better pred?
        } else if (eventType === 'm.room.power_levels') {
            // For this room, what user power level is needed for actions and event types?
            // https://spec.matrix.org/v1.6/client-server-api/#mroompower_levels
            console.warn('Inoring state power levels', content) // useful to store in the room

        } else if (eventType === 'm.room.bot.options') { // { github: { default_repo: 'linkeddata/dokieli' } }
            if (content.github && content.github.default_repo) {
                await saveUniqueValueToChannel(chatChannel, ns.doap('repository'), $rdf.sym('https://github.com/' + content.github.default_repo + '/'), config)
            }
        } else if (eventType === 'm.space.child') {
            // like suggested: false, via: [ 'gitter.im', 'matrix.org', 'chat.semantic.works' ]
            console.log('Ignoring event type ' + eventType)
        } else if (eventType === 'uk.half-shot.bridge') {
            console.log('Ignoring event type ' + eventType)
        } else { // eg also im.vector.modular.widgets
            console.log('State type ' + eventType + ' unknown: content: ', content)
            console.warn('State type ' + eventType + ' unknown: event: ', event)
            // throw new Error('State type unknown: ' + eventType)
        }

    } else { // NOT STATE

        if (eventType === 'm.room.encrypted') {
            console.log('Warning: encrypted messages are not supported.')
            messageData.text = content.ciphertext.slice(0,60) + '...'
        } else if (eventType === "m.room.redaction") {
            console.log(' Ignoring  REDACTED: ' + event.event.redacts)
            messageData.text = '<redaction>'
        } else if (eventType === "m.room.message") {
            if (event.event && event.event.redacted_because) {
              messageData.text = '' // Redacted message and redacting message are both hidden
              messageData.deleted = true
            // https://spec.matrix.org/v1.2/client-server-api/#mroommessage-msgtypes
            } else if (content.msgtype === 'm.emote') {
                console.log(' Hey -- emote', content)
                messageData.text = content.body
                messageData.richText = getRichText(content)
                messageData.isEmotion = true
            } else if (content.msgtype === 'm.audio' || content.msgtype === 'm.file' || content.msgtype === 'm.video') {
                //   body: 'foo.ttl',
                //    info: { mimetype: 'text/turtle', size: 10 }
                messageData.metadata = content.info // mimetype etc
                messageData.text = matrixClient.mxcUrlToHttp(content.url, null, null, null, true)
                console.log('     File url', messageData.text)
            } else if (content.msgtype === 'm.image') {
                //   body: 'image.png',
                //   info: { h: 256, mimetype: 'image/png', size: 15119, w: 256,
                //   'xyz.amorgan.blurhash': 'UBHxOUxt00Icxea#j;j@00Rl_5xns=j@R#j?'},
                messageData.metadata = content.info // mimetype etc
                messageData.text = matrixClient.mxcUrlToHttp(content.url, null, null, null, true)
                console.log('@@ Image body content', content)
                console.log('@@ Image  url', messageData.text)
            } else if (content.msgtype === 'm.text' || content.msgtype === 'm.notice') {
                messageData.text = content.body
                messageData.richText = getRichText(content)
            } else {
                if (!content.msgtype) { // no mssage type given at all?
                    messageData.text = '<untyped>'
                    if (event.unsigned && event.unsigned.redacted_because) {
                        messageData.text = '<redacted>'
                    }
                } else {
                    console.log(` @@ checkout this ${content.msgtype} content`, content)
                    console.log(` @@ checkout this ${content.msgtype} event`, event)
                    // throw new Error(`Event m.message has unexpected message type "${content.msgtype}"`)
                }
            }
        }

        const gitterMessage = { id: eventId.slice(1), sent: messageData.time, fromUser: messageData.sender, text: messageData.text,
          replaces: messageData.replaces, replyTo: messageData.replyTo, threadRoot: messageData.threadRoot, isEmotion: messageData.isEmotion, metadata: messageData.metadata  }

        const archiveBaseURI = archiveBaseURIFromMatrixRoom(room, config)
        const author = await authorFromMatrix(userData, config)
        if (typeof messageData.text !== 'string') {
            console.log('No text ' + messageData.text + ' on event: ', event)
           throw new Error(`Matrix message: No main text in message ${eventId}`)
       }
        await storeMessage (chatChannel, gitterMessage, archiveBaseURI, author)
    }
    console.log(`${flag} >>>> [${time}] ${eventType} <${userData.id}> "${name}": ${body.slice(0,80)}`)
    return time
}

async function loadRoomMessages (room, config) {

    async function getSome () {
        var result
        for (var chunk = 0; chunk < MAX_SCROLLS; chunk++) {
            console.log('Scrollback:')
            result = await matrixClient.scrollback(room, MESSAGES_AT_A_TIME);
            console.log(' Result of scrollback ' + show(result)) // show(result)
            // console.log(`    oldState           `, result.oldState)
            console.log(`    paginationToken    ${result.oldState.paginationToken}`)
            const timeline = result.timeline
            const n = timeline.length
            console.log(`    (${n}) from ${timeOfEvent(timeline[0])}  to  ${timeOfEvent(timeline[n-1])} `)
            const earliestDate = timeOfEvent(timeline[0])
            if (earliestDate < MESSAGE_LOAD_CLIP) {
                console.log(` Found message ${earliestDate} before ${MESSAGE_LOAD_CLIP} ✅`)
                break
            }
        }
        return result
    }
    console.log(`loadRoomMessages: room name ${room.name}`)
    const chatChannel = chatChannelFromMatrixRoom(room, config)    // console.log(show(room))
    const result =  await getSome()

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
        const time = await handleMatrixMessage(item, room, chatChannel, config);
        if (!earliestMessage || time < earliestMessage) earliestMessage = time;
        if (!latestMessage || time > latestMessage) latestMessage = time;
    }
    console.log()
    console.log(`Room name ${room.name}`)
    console.log('   Events ', events)
    console.log('   Messages ', messages)
    console.log('   Earliest message ', earliestMessage)
    console.log('   Latest message   ', latestMessage)

    console.log('  toBeLinked length   ' + toBeLinked.length)
    console.log('  editedMessages length   ' + Object.keys(editedMessages).length)
    console.log('  toBeExecuted length ' + toBeExecuted.length)

    for (let [originalId, edited] of Object.entries(editedMessages)) {
        console.log(` editedMessages: ${originalId} -> message ${edited}`)
        const originalURI = eventMap[originalId]
        let original = null
        if (!originalURI) {
            // throw new Error(' editedMessages: Cant find original ' + originalId)
            console.warn(' editedMessages: Cant find original ' + originalId)
        } else {
            original = $rdf.sym(originalURI)
            console.log(` editedMessages: original ${original}`)
            edited.push(original) // might as well just sort it with the others
        }

        const sortMe = edited.map(message => [store.any(message, ns.dct('created'), null, message.doc()), message])
        sortMe.sort()
        console.log('editedMessages : all messsages '  + sortMe.length)

        if (sortMe.length > 1) {
            console.log(`editedMessages for ${original}: ` + sortMe.map(x => `  time ${x[0]} message ${x[1].uri.slice(-10)}`).join('\n  '))
        }
        const timeley = sortMe.filter(x => x[0] && x[0].value > MESSAGE_LOAD_CLIP)

        console.log('editedMessages : timeley messsages '  + timeley.length)

        for (let i = 0; i < timeley.length - 1; i++) { // All but one
            const earlier = timeley[i][1]
            const later = timeley[i+1][1]
            console.log(`  editedmessages finally ${earlier.uri.slice(-10)} replaced by ${later.uri.slice(-10)} `)
            store.add(earlier, ns.dct('isReplacedBy'), later, earlier.doc())
            toBePut[earlier.doc().uri] = true
            if (!earlier.doc().sameTerm(later.doc())) {
                store.add(earlier, ns.dct('isReplacedBy'), later, later.doc())
                toBePut[later.doc().uri] = true
            }
        }
    }
    if (toBeLinked.length > 0) {
        await linkEverything()
    }
    await executeEverything()

    console.log(' toBePut length ' + Object.keys(toBePut).length)
    await saveEverythingBack()
}

async function linkEverything () {
    console.log('linkEverything:  toBeLinked length ' + toBeLinked.length)
    let successes = 0, failures = 0;

    while(toBeLinked.length > 0) {
        const { message, predicate, target, reverse } = toBeLinked.pop()
        const targetMessageURI = eventMap[target]

        // const targetMessage = await findEventById(message, target)
        if (!targetMessageURI) {
            console.warn(`  linkEverything: Failed to find ${target} around ${message} ❌`)
            // throw new Error (`linkEverything: Failed to find ${target} near ${message}`)
            failures += 1
        } else {
            successes += 1
            const targetMessage = $rdf.sym(targetMessageURI)
            // console.log(`   Found  ${target} at ${targetMessage} ✅`)
            if (message.doc().sameTerm(targetMessage.doc())) {
                console.log(`(Found ${targetMessage} in same doc as ${message}) `)
            }
            if (!reverse) {
                store.add(message, predicate, targetMessage, message.doc())
                store.add(message, predicate, targetMessage, targetMessage.doc())
            } else {
                store.add(targetMessage, predicate, message, message.doc())
                store.add(targetMessage, predicate, message, targetMessage.doc())
            }
            toBePut[message.doc().uri] = true
            toBePut[targetMessage.doc().uri] = true
        }
    }
    console.log(` linkEverything: ${successes} successes, ${failures} failures.`)
}

async function executeEverything () {
    console.log('execureEverything:  number toBeExecuted: ' + toBeExecuted.length)
    while(toBeExecuted.length > 0) {
        // console.log('Executing one:')
        toBeExecuted.pop()()
    }
}

async function processMatrixRoom (room, config) {
    console.log(`\n Room ${showRoom(room)}`)
    if (command === 'catchup') {
        newMessages = 0
        oldMessages = 0
        const already = await initializeChannel(room, config)
        var myMembership = room.getMyMembership();
        await loadRoomMessages(room, config)
        console.log(`Totals for room ${room.roomId} old messages: ${oldMessages}, new: ${newMessages}`)
    } else if (command === 'show') {
        const chatChannel = chatChannelFromMatrixRoom(room, config)
        await store.fetcher.load(chatChannel.doc())
        const sts = store.connectedStatements(chatChannel)
        const text = $rdf.serialize(chatChannel.doc(), store, chatChannel.doc().uri, 'text/turtle')
        console.log('Channel data:' + text)
    } else if (command === 'init') {
        const chatChannel = chatChannelFromMatrixRoom(room, config)
        await initializeChannel(room, config)
        await saveEverythingBack()
        console.log('Initialised ' + chatChannel)
    } else if (command === 'list') {
        showRoom(room)
    } else {
        console.log('Unknown command. Commands are :list, int, catchup' )
    }
}

async function processMatrixRooms (config) {
    console.log(`We see ${roomList.length} Matrix rooms`)
    if (targetRoomName === 'all') {
        for (let i = 0; i < roomList.length; i++) {
            const room = roomList[i]
            await processMatrixRoom(room, config)
        }
    } else {
        for (let i = 0; i < roomList.length; i++) {
            const room = roomList[i]
            if (targetRoomName === room.name) {
                console.log(` Found room <${room.roomId}> as name "${targetRoomName}"`)
                await processMatrixRoom(room, config)
                return;
            } else if (targetRoomName === room.roomId) {
                console.log(` Found room <${room.roomId}> as id "${targetRoomName}"`)
                await processMatrixRoom(room, config)
                return;
            }
        }
        console.error(`Error: Target rooom name ${targetRoomName} not found.\nRooms:`)
        printRoomList()
    }
    console.log('All done, exiting.')
    process.exit(0)
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
          // console.log(` should be all put back: ${Object.keys(toBePut).length}`)
          console.log('Exit.')
          process.exit(0)
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
  return false
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

      console.log('folderStore: <\n' + folderStore + '\n > ')
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

function matrixThingFromEventId (eventId) {
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
async function findEventById (currentMessage, thread) {
    const matrixURI = matrixThingFromEventId(thread)
    console.log(`findEventById ${currentMessage}, ${thread} -> ${matrixURI}`)

    if (thread.startsWith('$')) {
        throw new Error('Sigil should have been removed from: ' + thread)
    }
    /*
    const threadFromId = store.any(null, ns.sioc('id'), matrixURI)
    if (threadFromId) {
        console.log(' Found thread from ID 🎉 at ' + threadFromId)
        return threadFromId
    }
    */
    let possible = $rdf.sym(currentMessage.doc().uri + '#' + thread)
    if (store.connectedStatements(possible).length > 0) {
        console.log(' Found thread root same day 🎉 at ' + possible)
        return  possible
    }
    let loading = possible // scan backwards

    for (let i=0; i < THREAD_LOAD_RANGE; i++) {
        let exists  = await loadIfExists(loading)
        if (exists) { // new data
            let scanning = possible
            for (let j=0; i < THREAD_SCAN_RANGE; i++) {
                if (store.connectedStatements(scanning).length > 0) { // any mentio  in any doc
                    console.log(' Found past thread root 🎉 at ' + scanning)
                    // console.log('Connected statements', store.connectedStatements(scanning))
                    return  scanning
                }
                scanning = previousDay(scanning)
            }
        }
        loading = previousDay(loading)
    }
    console.warn('Did not find thread root ' + possible)
    return null
}

/** Convert Matrix reaction to Solid
*/
async function storeAction(action, config) {
  const { reactionId, sender, time, target, content, senderId } = action;
  const klass = ActionClassFromEmoji(content) || ns.schema('ReactAction') // Superclass
  const author = userFromMatrixId(senderId, config)
  toBeExecuted.push( function() {
      // console.log('Delayed function:')
      let targetURI = eventMap[target]

      if (!targetURI) {
          console.warn('storeAction:  Linking action to message: ❌ Could not find ' + target)
          return
          // targetURI = matrixThingFromEventId(target)
          // console.warn('    Linking to message: so using ' + targetURI)
      } else {
          const targetMessage = $rdf.sym(targetURI)
          const doc = targetMessage.doc()
          const action = $rdf.sym(doc.uri + '#' + reactionId.slice(1) + '-action')
          store.add(action, ns.rdf('type'), klass, doc)
          store.add(action, ns.schema('agent'), author, doc)
          store.add(action, ns.schema('target'), targetMessage, doc)
          if (content) {
              store.add(action, ns.sioc('content'), content, doc)
          }
          toBePut[doc.uri] = true
          console.log(`storeAction: Success adding action "${content}" action ${klass} on ${targetMessage} 🎉`)
      }
  })
}
/**  Convert gitter message to Solid
 *
*/
// See https://developer.gitter.im/docs/messages-resource

var newMessages = 0
var oldMessages = 0

async function storeMessage (chatChannel, gitterMessage, archiveBaseURI, author) {

    async function storeRelatedEvent (message, target, predicate, reverse) {
        console.log(`storeRelatedEvent: ${target}, ${predicate} ${reverse?"REVERSE":"Forward"}`)
        toBeLinked.push({ message, predicate, target, reverse} )
    }

    var sent = new Date(gitterMessage.sent) // Like "2014-03-25T11:51:32.289Z"
    var chatDocument = chatDocumentFromDate(chatChannel, sent)
    var message = $rdf.sym(chatDocument.uri + '#' + gitterMessage.id) // like "53316dc47bfc1a000000000f"
    console.log(' storeMessage:        Solid Message  ' + message)
    eventMap[gitterMessage.id] = message.uri // need to be able to link to it later

    // console.log(`  storeMessage gitterMessage `, gitterMessage)
    if (gitterMessage.sent < MESSAGE_LOAD_CLIP) {
        console.log(`storeMessage: Skip: ${gitterMessage.sent} is TOO EARLY, before ${MESSAGE_LOAD_CLIP}`)
        return
    }

    await loadIfExists(chatDocument)
    if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
        // console.log(`  already got ${gitterMessage.sent} message ${message}`)
        oldMessages += 1
        console.log(`storeMessage: Got message already.`)
        return // alraedy got it
    }
    newMessages += 1
    const id = matrixThingFromEventId(gitterMessage.id)

    store.add(chatChannel, ns.wf('message'), message, chatDocument)

    store.add(message, ns.sioc('id'), id, chatDocument)

    if (typeof gitterMessage.text == 'string') { // 0 length is OK
        store.add(message, ns.sioc('content'), gitterMessage.text, chatDocument)
    } else {
        throw new Error(`storeMessage: No main text in message.`)
    }
    if (gitterMessage.richText && gitterMessage.richText !== gitterMessage.text) { // is it new information?
    store.add(message, ns.sioc('richContent'), gitterMessage.richText, chatDocument) // @@ predicate??
    }
    store.add(message, ns.dct('created'), sent, chatDocument)
    if (gitterMessage.edited) {
        store.add(message, ns.dct('modified'), new Date(gitterMessage.edited), chatDocument)
    }
    if (gitterMessage.threadRoot) {

        console.log(` Storing memberhip by ${gitterMessage.id.slice(-10)} of thread based on ${gitterMessage.threadRoot.slice(-10)} `)

        toBeExecuted.push( function() {
            // console.log('Delayed function:')
            let threadRootMessageURI = eventMap[gitterMessage.threadRoot]
            if (!threadRootMessageURI) {
                console.warn(' Linking to message: Could not find ' + gitterMessage.threadRoot)
                threadRootMessageURI = matrixThingFromEventId(gitterMessage.threadRoot)
                console.warn('    Linking to message: so using ' + threadRootMessageURI)
            } else {
                const threadRootMessage = $rdf.sym(threadRootMessageURI)
                const thread = $rdf.sym(threadRootMessage.uri + '-thread')
                store.add(thread, ns.rdf('type'), ns.sioc('Thread'), thread.doc())
                store.add(threadRootMessage, ns.sioc('has_reply'), thread, thread.doc())

                store.add(thread, ns.sioc('has_member'), message, thread.doc())
                store.add(thread, ns.sioc('has_member'), message, message.doc())
                toBePut[message.doc().uri] = true
                toBePut[thread.doc().uri] = true
            }
        })

        // await storeRelatedEvent(message, gitterMessage.threadRoot, ns.sioc('has_member'))
    }
    if (gitterMessage.replyTo) {
        await storeRelatedEvent(message, gitterMessage.replyTo, ns.sioc('has_reply'), true) // Reverse
    }
    if (gitterMessage.replaces) {
        const target = gitterMessage.replaces
        editedMessages[target] = editedMessages[target] || []
        editedMessages[target].push(message)
        // await storeRelatedEvent(message, gitterMessage.replaces, ns.dct('isReplacedBy'), true) // reverse

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

async function initializeChannel (room, config) {
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
      if (!store.holds(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)) {

          console.warn('@@ wot no type LongChat' + solidChannel)
          store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)

          toBePut[newChatDoc.uri] = true
      }
      if (!store.any(solidChannel, ns.dc('title'), null, newChatDoc)) {
          console.warn('@@ wot no title' + solidChannel)
          store.add(solidChannel, ns.dc('title'), room.name + ' matrix chat archive', newChatDoc)
          toBePut[newChatDoc.uri] = true

      }
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
    await initializeChannel(room, config)
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
    var already = await initializeChannel(room, config)
    // console.log('Solid channel already there:' + already)
  } else if (command === 'create') {
    await create()
  }
}

async function loadConfig () {
  let webId;
  const localPod = process.env.LOCAL_POD
  if (!localPod) {
      console.error('Specificy LOCAL_POD in environment for your config.')
      process.exit(-2)
  }
  // let localPod = process.argv[4];
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
/*
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
  */
} // go

var toBePut = []
var toBeLinked = [] // List messages to be linked to thngs we only have matrix ID for
var editedMessages = {} // edited messages need to vbe converted from hub to chain
var toBeExecuted = [] //functions to be run  when we know eventMap
var eventMap = {} // Map eventid to solid URI
var peopleDone = {}
const opts = ['individualChatFolder', 'privateChatFolder', 'publicChatFolder', 'publicUserFolder']
go()

// ends
