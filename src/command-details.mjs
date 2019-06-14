import { getChannelByName, getChannelDetails } from './slack-api'

export default async function showDetailsForChannel (channelName) {
  try {
    const channel = await getChannelByName(channelName)
    if (!channel) {
      return
    }

    const infoResponse = await getChannelDetails(channel)
    console.log(infoResponse.channel)
  } catch (e) {
    console.error(e)
  }
}
