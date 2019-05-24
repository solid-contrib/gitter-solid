import { getAllMessages, getAllUsers, getChannelByName } from './slack-api'
import { chatUriFromSlackName } from './class-archive'
import { closeInput } from './input-utils'

const USER_TOKEN = process.env.SLACK_USER_TOKEN

export default async function archiveChannel (archive, channelName) {
  // const channel = await getChannelByName(bot, channelName)
  // console.log(`Doing channel ${channel.name} (Channel ID: ${channel.id})`)
  // const solidChannel = chatUriFromSlackName(channel.name, archiveBaseURI)
  // console.log('solidChannel', solidChannel)
  // console.log(archive)

  // const users = await getAllUsers(bot)
  // const messages = await getAllMessages(bot, channel, userToken)
  // console.log(messages.length, users.length)

  closeInput()
}