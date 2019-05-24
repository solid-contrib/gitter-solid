import { getChannels } from './slack-api'

export default async function listChannels () {
  const channels = await getChannels()
  channels.forEach(channel => console.log(`#${channel.name}`))
}
