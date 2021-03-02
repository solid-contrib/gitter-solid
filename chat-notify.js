/* Notify me of solid chat new things
*
* Keeps track of what things you want to track in your solid preferences file
*
*/

import $rdf from 'rdflib'
import {SolidNodeClient} from 'solid-node-client';
const client = new SolidNodeClient({parser:$rdf})
global.solidFetcher = client.fetch.bind(client);

// import DateFolder  from '../solid-ui/src/chat/dateFolders.js'
import  { DateFolder } from './logic/dateFolder.js'
import fs from 'fs'
import  solidNamespace from 'solid-namespace'

const store = new $rdf.Store()
const kb = store // shorthand -- knowledge base

const fetcher = $rdf.fetcher(store);
const updater = new $rdf.UpdateManager(store)

const instructions = `Solid chat export and subscriptions

These (mostly) leverage your solid pod to store your subscriptions
and record where
Run this as node chat-notify <command> <solidChatUri>  <filename>

     show        chat file  Makes a local HTML file of the chat
     list                   Lists your subscriptions
     subscribe   chat       Add this chat to the ones you get notified about
     notify
`

// const solidNamespace = require('solid-namespace')
const ns = solidNamespace($rdf)
const a = ns.rdf('type')

const command = process.argv[2]
const solidChatURI = process.argv[3] || 'https://timbl.com/timbl/Public/Archive/solid/chat/index.ttl#this'
const outputFileName = process.argv[4] || null

const solidChat = $rdf.sym(solidChatURI)

// const messageBodyStyle = 'white-space: pre-wrap; width: 99%; font-size:100%; border: 0.07em solid #eee; padding: .3em 0.5em; margin: 0.1em;',
// const messageBodyStyle =  require('../solid-ui/src/style').messageBodyStyle


function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* Solid chat stuff
*/
function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

function clone (options) {
  return Object.assign({}, options)
}

async function loadIfExists (doc) {
  try {
    // delete fetcher.requested[doc.uri]
    await fetcher.load(doc, clone(normalOptions))
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('    No chat file yet, creating later ' + doc)
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

function escapeXml (unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
    }
  })
}
const normalOptions = {
//   headers: {Authorization: 'Bearer ' + SOLID_TOKEN}
}
const forcingOptions = {
  // headers: {Authorization: 'Bearer ' + SOLID_TOKEN},
  force: true }

function suitable (x) {
  let tail = x.uri.slice(0, -1).split('/').slice(-1)[0]
  if (!'0123456789'.includes(tail[0])) return false // not numeric
  return true
  // return kb.anyValue(chatDocument, POSIX('size')) !== 0 // empty file?
}

/* Find the first (or last) message in the time series folders
*/
async function firstMessage (chatChannel, backwards) { // backwards -> last message
  var folderStore = $rdf.graph()
  var folderFetcher = new $rdf.fetcher(folderStore)
  async function earliestSubfolder (parent) {
    console.log('            parent ' + parent)
    delete folderFetcher.requested[parent.uri]
    var resp = await folderFetcher.load(parent, clone(forcingOptions)) // Force fetch as will have changed

    var kids = folderStore.each(parent, ns.ldp('contains'))
    kids = kids.filter(suitable)
    if (kids.length === 0) {
      throw new Error(' @@@  No children to         parent2 ' + parent)
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
    let msg = '  INCONSISTENCY -- no chat message in file ' + chatDocument
    console.trace(msg)
    throw new Error(msg)
  }
  let sortMe = messages.map(message => [folderStore.any(message, ns.dct('created')), message])
  sortMe.sort()
  if (backwards) sortMe.reverse()
  console.log((backwards ? 'Latest' : 'Earliest') + ' message in solid chat is ' + sortMe[0][1])
  return sortMe[0][1]
} // firstMessage

function hashSymbol (x, doc) {
  var hash = function (x) { return x.split('').reduce(function (a, b) { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0) }
  return $rdf.sym(doc.uri + '#X' + (hash(x.uri) & 0x7fffffff).toString(16))
}

/*  Convert messages to HTML
*/
async function htmlFromMessages (chatChannel, messages, startTime) {
  console.log(`Messages from ${startTime}`)
  var sortMe = messages.map(m => [ kb.the(m, ns.dct('created')).value, m])
  sortMe.sort()
  sortMe = sortMe.filter(x => x[0] >= startTime)
  var todo = sortMe.map(x => x[1])
  console.log('to do  ' + todo.length)

  var t = kb.anyValue(chatChannel, ns.dct('title')) || ''

  var title = `Messages from solid chat ${t}`
  var htmlText = `<html>
  <head>
    <title>${escapeXml(title)}</title>
    <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
  </head>
  <body>
  <table>
  `
  var lastMaker = null
  for (var message of todo) {
    let created = kb.the(message, ns.dct('created'))
    let when = created.value.slice(11, 16) // hhmm
    let maker = kb.the(message, ns.foaf('maker'))
    await fetcher.load(maker.doc())
    let nick = kb.any(maker, ns.foaf('nick')).value
    let photo = kb.any(maker, ns.vcard('photo')).uri
    let content = kb.anyValue(message, ns.sioc('richContent')) || escapeXml(kb.anyValue(message, ns.sioc('content')))
    // @@ todo: sanitize html content

    console.log()
    console.log('-' + nick + ':  ' + when)
    console.log(' ---> ' + content)
    let dup = lastMaker && lastMaker.sameTerm(maker)
    let picHTML = dup ? '' :  `<img src="${photo}" style="width:3em; height:3em;">`
    let nameHTML = dup ? '' : `${nick} ${when}<br/>`

    htmlText += `\n<tr><td>${picHTML}</td><td>${nameHTML}\n${content}</td></tr>`
    lastMaker = maker
  }
  htmlText += `</table>
  </body>
  </html>
  `
  return htmlText
}

async function logInGetSubscriptions () {
  console.log('Log into solid')
  var session = await client.login()
  if (!session) throw new Error('Wot no solid session?')
  // console.log('sesssion ' + JSON.stringify(session))
  var me = session.webId
  if (!me) throw new Error('Wot no solid session  web ID?')
  console.log('me ' + me)

  me = $rdf.sym(me)
  var profile = me.doc()
  var context = { me }
  try {
    await kb.fetcher.load(profile)
  } catch (err) {
    console.error(err)
  }
  console.log('loaded ' + profile)
  var prefs = kb.any(me, ns.space('preferencesFile'), null, profile)

  if (!prefs) {
    console.log('hmmm ' + kb.connectedStatements(me))
    throw new Error('Cant find preferences file in ' + me.doc())
  }

  console.log('Preferences file: ' + prefs)
  try {
    await kb.fetcher.load(prefs)
  } catch (err) {
    throw new Error('cant load preferences file' + err)
  }
  console.log('statements: ' + kb.statementsMatching(null, null, null, prefs).length)
  const actions = kb.each(null, ns.schema('agent'), me, prefs) // is subscriber of?
  const subscriptions = actions.filter(action => kb.holds(action, a, ns.schema('SubscribeAction'), prefs))
  console.log('Actions: ' + actions.length)
  console.log('Subscriptions: ' + subscriptions.length)
  return { me, subscriptions, prefs}
}



async function loadMessages (chatChannel, lastNotified) {
  console.log('loadMessages ' + chatChannel)
  const dateFolder = new DateFolder(chatChannel, 'chat.ttl', ns.wf('message'), kb)
  const finalMessage = await dateFolder.firstLeaf(true)
  const initialMessage = lastNotified || await dateFolder.firstLeaf(false)

  console.log(`    Notifying messages between ${initialMessage} and ${finalMessage}`)
  if (initialMessage.sameTerm(finalMessage)) {
    console.log('      No new messagess')
    return {messages: [], startTime: null}
  } else {
    await fetcher.load(initialMessage)
    var messageFile = finalMessage.doc()
    while (1) {
      console.log('Loading ' + messageFile)
      await kb.fetcher.load(messageFile)
      var finalDate = dateFolder.dateFromLeafDocument(finalMessage.doc())
      var previousDate = await dateFolder.loadPrevious(finalDate)
      if (!previousDate) break // no more chat
      var previousFile = dateFolder.leafDocumentFromDate(previousDate)
      if (previousFile.sameTerm(initialMessage.doc())) {
        break // Loaded enough
      }
      messageFile = previousFile
    }
    var startTime = kb.the(initialMessage, ns.dct('created')).value
    var messages = kb.each(chatChannel, ns.wf('message'), null)
    console.log('messages altogether: ' + messages.length)
    return { messages, startTime}
  }
}

async function writeToFile (text, filename) {
  console.log('writing file...' + filename)
  fs.writeFile(filename, text, function (err) {
    if (err) {
      console.error('Error writing file ' + err)
    } else {
      console.log('written file')
    }
  })
}

async function go () {

  if (command === 'notify') {
    const { me, subscriptions, prefs} = await logInGetSubscriptions()
    for (let sub of subscriptions) {
      var chatChannel = kb.the(sub, ns.schema('object'))
      var lastNotified = kb.the(sub, ns.solid('lastNotified'))
      if (!lastNotified) {
        const dateFolder = new DateFolder(chatChannel, 'chat.ttl', ns.wf('message'), kb)

        const finalMessage = await dateFolder.firstLeaf(true)

        console.log('No previous notifications -- so start from here: ' + finalMessage)
        updater.update([], [$rdf.st(sub, ns.solid('lastNotified'), finalMessage, prefs)])
      } else {
        const {messages, startTime} = await loadMessages(chatChannel, lastNotified)
        const htmlText = await htmlFromMessages(chatChannel, messages, startTime)
        writeToFile(htmlText, ',temp.html')

      }
    }
  } // notify


  if (command === 'show') {
    if (!solidChat) throw new Error("No chat channel specified")
    // const { me, subscriptions} = await logInGetSubscriptions()
    const {messages, startTime, prefs} = await loadMessages(solidChat)
    const html = await htmlFromMessages(solidChat, messages, startTime)
    console.log(html)
    writeToFile(html, outputFileName || ',exported-chat.html')
  }

  if (command === 'list') {
    const { me, subscriptions, prefs} = await logInGetSubscriptions()
    console.log('Subscriptions:')
    for (let sub of subscriptions) {
      console.log('  Subscription to ' + kb.any(sub, ns.schema('object')))
      console.log('               by ' + kb.any(sub, ns.schema('agent')))
    }
  }

  if (command === 'subscribe') {
    const { me, subscriptions, prefs} = await logInGetSubscriptions()
    if (kb.any(null, ns.schema('object'), solidChat, prefs)) {
      console.log('Sorry already have something about ' + solidChat)
    } else {
      var subscription = hashSymbol(solidChat, prefs)
      await updater.update([], [$rdf.st(subscription, a, ns.schema('SubscribeAction'), prefs),
        $rdf.st(subscription, ns.schema('agent'), me, prefs),
        $rdf.st(subscription, ns.schema('object'), solidChat, prefs) ])
    }
  }

  console.log('ENDS')
}
var userContext = {}
var toBePut = []
go()

// ends
