/* Notify me of solid chat new things
*
*/
// import DateFolder  from '../solid-ui/src/chat/dateFolders.js'
const DateFolder = require('../solid-ui/src/chat/dateFolders.js')

const fs = require('fs')
const command = process.argv[2]

// var UI = require('../solid-ui/lib/index')
var $rdf = require('rdflib')
const solidNamespace = require('solid-namespace')
const ns = solidNamespace($rdf)
const a = ns.rdf('type')

const solidChatURI = process.argv[3] || 'https://timbl.com/timbl/Public/Archive/solid/chat/index.ttl#this'
const solidChat = $rdf.sym(solidChatURI)

// see https://www.npmjs.com/package/node-gitter
/*
const SOLID_TOKEN = process.env.SOLID_TOKEN
console.log('SOLID_TOKEN ' + SOLID_TOKEN.length)
if (!SOLID_TOKEN) {
  console.log('NO SOLID TOKEN')
  process.exit(2)
}

*/
/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const kb = store // shorthand -- knowledge base
const auth = require('solid-auth-cli') // https://www.npmjs.com/package/solid-auth-cli
const fetcher = $rdf.fetcher(store, {fetch: auth.fetch, timeout: 900000})
const updater = new $rdf.UpdateManager(store)

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

async function firstMessage (chatChannel, backwards) { // backwards -> last message
  var folderStore = $rdf.graph()
  var folderFetcher = new $rdf.Fetcher(folderStore)
  async function earliestSubfolder (parent) {
    console.log('            parent ' + parent)
    delete folderFetcher.requested[parent.uri]
    var resp = await folderFetcher.load(parent, clone(forcingOptions)) // Force fetch as will have changed
    // await delay(3000) // @@@@@@@ async prob??

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
    let msg = '  INCONSITENCY -- no chat message in file ' + chatDocument
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

async function go () {
  console.log('Log into solid')
  var session = await auth.login()
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
  if (command === 'notify') {
    for (let sub of subscriptions) {
      var chatChannel = kb.the(sub, ns.schema('object'))
      var finalMessage = await firstMessage(chatChannel, true)
      var lastNotified = kb.the(sub, ns.solid('lastNotified'))
      if (!lastNotified) {
        console.log('No previous notifications -- so start from here: ' + finalMessage)
        updater.update([], [$rdf.st(sub, ns.solid('lastNotified'), finalMessage, prefs)])
      } else {
        console.log(`    Notifying messages between ${lastNotified} and ${finalMessage}`)
        if (lastNotified.sameTerm(finalMessage)) {
          console.log('      No new messagess')
        } else {
          const dateFolder = new DateFolder(chatChannel, 'chat.ttl')
          await fetcher.load(lastNotified)
          var messageFile = finalMessage.doc()
          while (1) {
            console.log('Loading ' + messageFile)
            await kb.fetcher.load(messageFile)
            var finalDate = dateFolder.dateFromLeafDocument(finalMessage.doc())
            var previousDate = await dateFolder.loadPrevious(finalDate)
            if (!previousDate) break // no more chat
            var previousFile = dateFolder.leafDocumentFromDate(previousDate)
            if (previousFile.sameTerm(lastNotified.doc())) {
              break // Loaded enough
            }
            messageFile = previousFile
          }
          var startTime = kb.the(lastNotified, ns.dct('created')).value
          var messages = kb.each(chatChannel, ns.wf('message'), null)
          console.log('messages altogether: ' + messages.length)
          var sortMe = messages.map(m => [ kb.the(m, ns.dct('created')).value, m])
          sortMe.sort()
          sortMe = sortMe.filter(x => x[0] < startTime)
          var todo = sortMe.map(x => x[1])
          console.log('to do  ' + todo.length)

          var t = kb.anyValue(chatChannel, ns.dct('title')) || ''

          var title = `Messages from solid chat ${t}`
          var htmlText = `<html>
          <head>
            <title>${escapeXml(title)}</title>
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
          const filename = ',temp.html'
          console.log('writing file...')
          fs.writeFile(filename, htmlText, function (err) {
            if (err) {
              console.error('Error writing file ' + err)
            } else {
              console.log('written file')
            }
            console.log(htmlText)
          })
        }
      }
    }
  }
  if (command === 'list') {
    console.log('Subescriptions:')
    for (let sub of subscriptions) {
      console.log('  Subscription to ' + kb.any(sub, ns.schema('object')))
      console.log('               by ' + kb.any(sub, ns.schema('agent')))
    }
  }

  if (command === 'subscribe') {
    if (kb.any(null, ns.schema('object'), solidChat, prefs)) {
      console.log('Sorry already have somethhing about ' + solidChat)
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
