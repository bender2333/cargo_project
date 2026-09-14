# 部署后的浏览器回归

`npm run test:e2e:remote` 使用已部署服务，执行标记为 `@deployment` 的三条真实流程：越南保存模板再导入→20GP数量优先→继续手动微调，以及3D点选后的M/Delete和Backspace。

只需提供专用普通测试用户。管理员凭据仅在实际运行管理员用例时读取；不要使用业务用户账号进行部署回归。

远程地址使用HTTPS，或通过SSH将生产HTTP入口转发到本机回环地址：

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18080:127.0.0.1:80 cargo-server
```

在另一个终端配置验证进程并运行：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:18080'
$env:E2E_USERNAME = '<专用测试用户名>'
$env:E2E_PASSWORD = '<专用测试密码>'
npm run test:e2e:remote
```

缺少地址或测试凭据会立即失败，不会启动本地开发服务。默认结果保存到 `test-results/remote`，其中包含越南装箱俯视截图；可用 `-- --output=<目录>` 保留每轮产物。

远程配置固定一个worker、零重试、1920×1080视口和关闭trace。这三条用例不清空账号历史，越南用例只创建并删除自身的唯一命名模板。应确认成功结束后的临时模板已清理；测试中断时根据该次模板名称清理，不批量清除账号数据。

本地 `npm run test:e2e` 仍包含全部150条用例，在独立内存数据库上运行。远程三条回归不能替代本地全量验证；不要把默认全量套件直接指向生产服务。
