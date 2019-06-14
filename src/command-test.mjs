import { testApi } from './slack-api'

export default async function diagnoseApi () {
  const response = await testApi()
  console.log(response)
}