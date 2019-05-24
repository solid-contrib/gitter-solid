// rate limits - https://api.slack.com/docs/rate-limits
const RATE_LIMIT_TIER_1_MS = 60 * 1000 / 1
const RATE_LIMIT_TIER_2_MS = 60 * 1000 / 20
const RATE_LIMIT_TIER_3_MS = 60 * 1000 / 50
const RATE_LIMIT_TIER_4_MS = 60 * 1000 / 100

export async function getChannelByName (bot, channelName) {
  const channels = await getChannels(bot)
  const channel = channels.find(channel => channel.name === channelName)
  if (!channel) {
    throw new Error(`No channel ${channelName} found`)
  }
  return channel
}

export async function getAllMessages (bot, channelName, userToken) {
  const channel = await getChannelByName(bot, channelName)
  let messages = []
  let response
  do {
    response = await bot.conversations.history({
      channel: channel.id,
      token: userToken,
      ...(response && response.response_metadata ? {
        cursor: response.response_metadata.next_cursor
      } : {})
    })
    messages = messages.concat(response.messages)
    console.log(`Fetched ${messages.length} messages successfully`)
    await hold(RATE_LIMIT_TIER_3_MS)
  } while (response.has_more)
  return messages
}

export async function getAllUsers (bot) {
  let users = []
  let response
  do {
    response = await bot.users.list(response && response.response_metadata ? {
      cursor: response.response_metadata.next_cursor
    } : {})
    users = users.concat(response.members)
    console.log(`Fetched ${users.length} users successfully`)
    await hold(RATE_LIMIT_TIER_2_MS)
  } while (response.response_metadata.next_cursor !== '')
  return users
}

export async function getChannels (bot) {
  const response = await bot.conversations.list()
  return response.channels
}

export async function testApi (bot) {
  return await bot.api.test()
}

function hold (milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}