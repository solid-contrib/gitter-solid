import { getAllMessages, getAllUsers } from './slack-api'

export default async function archiveChannel (bot, channelName, userToken) {
  const users = await getAllUsers(bot)
  const messages = await getAllMessages(bot, channelName, userToken)
  console.log(messages.length, users.length)
}