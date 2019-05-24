import { testApi } from './slack-api'

export default async function diagnoseApi(bot) {
  const response = await testApi(bot)
  console.log(response)
}