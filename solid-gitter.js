// Gitter chat data to solid
// like GITTER_TOKEN 1223487...984 node solid-gitter.js
// See https://developer.gitter.im/docs/welcome
// and https://developer.gitter.im/docs/rest-api

var Gitter = require('node-gitter');

// see https://www.npmjs.com/package/node-gitter

const token = process.env.GITTER_TOKEN
console.log('token ' + token)
var gitter = new Gitter(token);

const targetRoom = 'Inrupt/team'

const archiveBaseURI = 'https://timbl.com/timbl/Public/Archive/'
const peopleBaseURI = 'https://timbl.com/timbl/Public/Archive/Person/'


//////////////////////////////// Solid Bits

function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

/** Decide URI of solid chat vchanel from name of gitter room
 *
 * @param gitterName {String} - like 'solid/chat'
*/
function chatChannelFromGitterName (gitterName) {
  if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
  return $rdf.sym(archiveBaseURI + gitterName)
}


/** Track gitter useres

*/

async function authorFromGitter (fromUser) {
  /* fromUser looks like
    "id": "53307734c3599d1de448e192",
    "username": "malditogeek",
    "displayName": "Mauro Pompilio",
    "url": "/malditogeek",
    "avatarUrlSmall": "https://avatars.githubusercontent.com/u/14751?",
    "avatarUrlMedium": "https://avatars.githubusercontent.com/u/14751?"
  */
  var person = $rdf.sym(peopleBaseURI + fromUser.id + '/index.ttl#this)
  try {
    await fetcher.load(person.doc)
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('No person file yet ' + person)
    } else {
      console.log(' #### Error reading person file ' + err)
      return
    }
  }

}
/**  Cobvert gitter message to Solid
 *
*/
// See https://developer.gitter.im/docs/messages-resource

async function storeMessage (chatChannel, m) {

  var author = authorFromGittter (user) {
    return
  }

  var sent = new Date(m.sent) // Like "2014-03-25T11:51:32.289Z"
  var doc = chatDocumentFromDate(chatChannel, sent)
  // var timestamp = '' + sent.getTime() // @@@ format?
  var message = $rdf.sym(chaDocument.uri + '#' + m.id) // like "53316dc47bfc1a000000000f"

  var fromUser = m.fromUser



  var sts  = []
  sts.push($rdf.st(chatChannel, ns.wf('message'), message, chatDocument))
  sts.push($rdf.st(message, ns.sioc('content'), m.text, chatDocument))
  sts.push($rdf.st(message, ns.sioc('richContent'), m.html, chatDocument)) // @@ predicate??

  sts.push($rdf.st(message, DCT('created'), sent, chatDocument))
  if (m.edited) {
    sts.push($rdf.st(message, DCT('modified'), new Date(m.edited), chatDocument))
  }
  sts.push($rdf.st(message, ns.foaf('maker'), author, chatDocument))

}



////////////////////////////////  Gitter bits

async function go () {
  var oneToOnes = []
  console.log('Logging in ...')
  const user = await gitter.currentUser()
  console.log('You are logged in as:', user.username);
  var rooms = await user.rooms()
  console.log('rooms ' + rooms.length)
  for (let r=0; r < rooms.length; r++) {
    var room = rooms[r]
    const oneToOne = room.oneToOne
    const noun = oneToOne? 'OneToOne' : 'Room'
    if (oneToOne) {
      oneToOnes.push(room)
    } else {
      console.log(`  ${noun} ${room.name} unread ${room.unreadItems}`)
      multiRooms.push(room)
      if (room.name === targetRoom) {
        console.log('Target room found: ' + room.name)
      }
    }
  }

  var repos = await user.repos()
  console.log('repos ' + repos.length)

  var orgs = await user.orgs()
  console.log('orgs ' + orgs.length)

  console.log('\nInrupt Team chat')
  const roomid = 'Inrupt/team'
  var room = await gitter.rooms.find(roomid)
  var chatMessages = room.chatMessages()
  console.log('chatMessages ' + chatMessages.length)

  console.log('ENDS')
}

go ()

// ends
