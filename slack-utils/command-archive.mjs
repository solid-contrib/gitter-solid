import { getAllMessages } from './slack-api'

export default async function archiveChannel (bot, channelName, userToken) {
  const messages = await getAllMessages(bot, channelName, userToken)
  console.log(messages.length)
}