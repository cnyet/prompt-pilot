/**
 * 每个测试文件加载前生效。
 * DATABASE_URL 指向 globalSetup 建好的独立测试库；清掉真实密钥，
 * 避免本地已配置的模型把本应离线的用例打到真实网络。
 */
process.env.DATABASE_URL = 'file:../data/test.db'
delete process.env.ARK_API_KEY