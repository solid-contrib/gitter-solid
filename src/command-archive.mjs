import { getAllMessages, getAllUsers, getChannelByName } from './slack-api'
import { Archive, chatUriFromSlackName } from './class-archive'

export default async function archiveChannel (channelName) {
  // const archive = await Archive.load()
  // const channel = await getChannelByName(channelName)
  // console.log(`Doing channel ${channel.name} (Channel ID: ${channel.id})`)
  // const solidChannel = chatUriFromSlackName(channel.name, archiveBaseURI)
  // console.log('solidChannel', solidChannel)
  // console.log(archive)

  const users = await getAllUsers()
  // const messages = await getAllMessages(bot, channel, userToken)
  console.log(users)
}