// rate limits - https://api.slack.com/docs/rate-limits
import Slack from "slack"
import dotenv from 'dotenv'

dotenv.config()

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN

const RATE_LIMIT_TIER_1_MS = 60 * 1000 / 1
const RATE_LIMIT_TIER_2_MS = 60 * 1000 / 20
const RATE_LIMIT_TIER_3_MS = 60 * 1000 / 50
const RATE_LIMIT_TIER_4_MS = 60 * 1000 / 100

const bot = new Slack({ token: BOT_TOKEN })

export async function getChannelByName (channelName) {
  const channels = await getChannels()
  const channel = channels.find(channel => channel.name === channelName)
  if (!channel) {
    throw new Error(`No channel ${channelName} found`)
  }
  return channel
}

export async function getChannelDetails (channel) {
  return await bot.conversations.info({ channel: channel.id })
}

export async function getAllMessages (channel, userToken) {
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

export async function getAllUsers () {
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

export async function getChannels () {
  const response = await bot.conversations.list()
  return response.channels
}

export async function testApi () {
  return await bot.api.test()
}

function hold (milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}