module.exports = async function (bot) {
  try {
    const response = await bot.conversations.list()
    response.channels.forEach(channel => console.log(`#${channel.name}`))
  } catch (e) {
    console.log(e)
  }
}
