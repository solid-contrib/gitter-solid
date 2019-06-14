import { Archive } from './class-archive'

export default async function initializeChannel(channelName) {
  const archive = await Archive.load()
  await archive.initiateChannel(channelName)
}