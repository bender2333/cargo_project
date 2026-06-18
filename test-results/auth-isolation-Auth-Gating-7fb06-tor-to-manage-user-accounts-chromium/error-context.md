# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-isolation.spec.ts >> Auth Gating, User Isolation, and Admin Panel >> allows administrator to manage user accounts
- Location: e2e\auth-isolation.spec.ts:158:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('货柜排箱装柜工作台')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('货柜排箱装柜工作台')

```

```yaml
- heading "创建新账号" [level=2]
- paragraph: 加入集装箱排布与装箱复核工作台
- text: "Failed to execute 'json' on 'Response': Unexpected end of JSON input 用户名"
- textbox "用户名":
  - /placeholder: 请输入用户名
  - text: u1_adm_yho76
- text: 密码
- textbox "密码":
  - /placeholder: 请输入密码
  - text: Password123!
- text: 确认密码
- textbox "确认密码":
  - /placeholder: 请再次输入密码
  - text: Password123!
- button "注册"
- button "已有账号？立即登录"
```

# Test source

```ts
  69  |     await page.click('button:has-text("历史")')
  70  |     await expect(page.getByText('Shipment-User1')).toBeVisible()
  71  |     
  72  |     // Log out User 1
  73  |     await page.click('text=退出')
  74  |     await expect(page.getByText('货柜装箱计算系统')).toBeVisible()
  75  | 
  76  |     // 2. Register and log in as User 2
  77  |     await page.click('text=没有账号？立即注册')
  78  |     await page.fill('#username', user2)
  79  |     await page.fill('#password', testPassword)
  80  |     await page.fill('#confirmPassword', testPassword)
  81  |     await page.click('button[type="submit"]')
  82  |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  83  | 
  84  |     // Open custom container presets dialog
  85  |     await page.click('text=管理自定义柜型')
  86  |     // Verify User 1's custom container is NOT visible (strict isolation!)
  87  |     await expect(page.getByText('Container-User1')).not.toBeVisible()
  88  | 
  89  |     // Create User 2's custom container
  90  |     await page.click('text=+ 新增柜型')
  91  |     await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User2')
  92  |     await page.fill('label:has-text("长 mm") >> xpath=../input', '6100')
  93  |     await page.fill('label:has-text("宽 mm") >> xpath=../input', '2200')
  94  |     await page.fill('label:has-text("高 mm") >> xpath=../input', '2200')
  95  |     await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '12000')
  96  |     await page.click('button[type="submit"]:has-text("保存")')
  97  |     await expect(page.getByText('Container-User2')).toBeVisible()
  98  |     await page.click('text=选用')
  99  | 
  100 |     // Go to History tab
  101 |     await page.click('button:has-text("历史")')
  102 |     // Verify User 1's shipment plan is NOT visible (strict isolation!)
  103 |     await expect(page.getByText('Shipment-User1')).not.toBeVisible()
  104 | 
  105 |     // Save a plan for User 2
  106 |     await page.click('button:has-text("工作台")')
  107 |     await page.getByLabel('Shipment name').fill('Shipment-User2')
  108 |     await page.click('button:has-text("装箱")')
  109 |     await page.click('button:has-text("保存方案")')
  110 |     await page.click('button:has-text("历史")')
  111 |     await expect(page.getByText('Shipment-User2')).toBeVisible()
  112 | 
  113 |     // Log out User 2
  114 |     await page.click('text=退出')
  115 |   })
  116 | 
  117 |   test('persists custom cargo library per user and can add saved cargo to the workbench', async ({ page }) => {
  118 |     const user1 = `u1_cargo_${Math.random().toString(36).substring(7)}`
  119 |     const user2 = `u2_cargo_${Math.random().toString(36).substring(7)}`
  120 | 
  121 |     await page.goto('/')
  122 |     await page.click('text=没有账号？立即注册')
  123 |     await page.fill('#username', user1)
  124 |     await page.fill('#password', testPassword)
  125 |     await page.fill('#confirmPassword', testPassword)
  126 |     await page.click('button[type="submit"]')
  127 |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  128 | 
  129 |     await page.getByTestId('nav-cargo-library').click()
  130 |     await expect(page.getByTestId('cargo-library')).toBeVisible()
  131 |     await page.getByTestId('cargo-library').getByLabel('名称').fill('CargoLib-User1')
  132 |     await page.getByTestId('cargo-library').getByLabel('分组 1').fill('CL')
  133 |     await page.getByTestId('cargo-library').getByLabel('长 mm').fill('900')
  134 |     await page.getByTestId('cargo-library').getByLabel('宽 mm').fill('700')
  135 |     await page.getByTestId('cargo-library').getByLabel('高 mm').fill('500')
  136 |     await page.getByTestId('cargo-library').getByLabel('重量 kg').fill('33')
  137 |     await page.getByTestId('cargo-library-add').click()
  138 |     await expect(page.getByText('CargoLib-User1')).toBeVisible()
  139 | 
  140 |     await page.reload()
  141 |     await page.getByTestId('nav-cargo-library').click()
  142 |     await expect(page.getByText('CargoLib-User1')).toBeVisible()
  143 |     const savedRow = page.locator('[data-testid^="cargo-library-row-"]:has-text("CargoLib-User1")')
  144 |     await savedRow.getByRole('button', { name: '加入当前工作台' }).click()
  145 |     await expect(page.getByRole('button', { name: /CL CargoLib-User1/ })).toBeVisible()
  146 | 
  147 |     await page.click('text=退出')
  148 |     await page.click('text=没有账号？立即注册')
  149 |     await page.fill('#username', user2)
  150 |     await page.fill('#password', testPassword)
  151 |     await page.fill('#confirmPassword', testPassword)
  152 |     await page.click('button[type="submit"]')
  153 |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  154 |     await page.getByTestId('nav-cargo-library').click()
  155 |     await expect(page.getByText('CargoLib-User1')).not.toBeVisible()
  156 |   })
  157 | 
  158 |   test('allows administrator to manage user accounts', async ({ page }) => {
  159 |     const adminUser1 = `u1_adm_${Math.random().toString(36).substring(7)}`
  160 |     const adminUser2 = `u2_adm_${Math.random().toString(36).substring(7)}`
  161 | 
  162 |     // Register two target users first so they exist in database
  163 |     await page.goto('/')
  164 |     await page.click('text=没有账号？立即注册')
  165 |     await page.fill('#username', adminUser1)
  166 |     await page.fill('#password', testPassword)
  167 |     await page.fill('#confirmPassword', testPassword)
  168 |     await page.click('button[type="submit"]')
> 169 |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
      |                                               ^ Error: expect(locator).toBeVisible() failed
  170 |     await page.click('text=退出')
  171 | 
  172 |     await page.click('text=没有账号？立即注册')
  173 |     await page.fill('#username', adminUser2)
  174 |     await page.fill('#password', testPassword)
  175 |     await page.fill('#confirmPassword', testPassword)
  176 |     await page.click('button[type="submit"]')
  177 |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  178 |     await page.click('text=退出')
  179 | 
  180 |     // 1. Log in as seeded default administrator
  181 |     await page.fill('#username', 'admin')
  182 |     await page.fill('#password', 'admin123')
  183 |     await page.click('button[type="submit"]')
  184 |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  185 | 
  186 |     // Open User Management panel
  187 |     await page.click('button:has-text("用户管理")')
  188 |     await expect(page.getByText('用户账号管理')).toBeVisible()
  189 |     await expect(page.getByText('管理员控制面板')).toBeVisible()
  190 | 
  191 |     // Verify adminUser1 and adminUser2 are listed
  192 |     await expect(page.getByText(adminUser1)).toBeVisible()
  193 |     await expect(page.getByText(adminUser2)).toBeVisible()
  194 | 
  195 |     // Verify we cannot toggle status or delete the master 'admin' account
  196 |     const adminRow = page.locator('tr:has-text("admin")')
  197 |     await expect(adminRow.locator('button:has-text("禁用")')).toHaveCount(0)
  198 |     await expect(adminRow.locator('button:has-text("删除")')).toHaveCount(0)
  199 | 
  200 |     // Disable adminUser1's account
  201 |     const user1Row = page.locator(`tr:has-text("${adminUser1}")`)
  202 |     await user1Row.locator('button:has-text("禁用")').click()
  203 |     await expect(user1Row.locator('text=已禁用')).toBeVisible()
  204 | 
  205 |     // Log out Admin
  206 |     await page.click('text=返回工作台')
  207 |     await page.click('text=退出')
  208 | 
  209 |     // 2. Try logging in with disabled adminUser1
  210 |     await page.fill('#username', adminUser1)
  211 |     await page.fill('#password', testPassword)
  212 |     await page.click('button[type="submit"]')
  213 |     // Should show error notification
  214 |     await expect(page.getByText(/账号已被禁用|Account has been disabled/)).toBeVisible()
  215 | 
  216 |     // 3. Log back as admin and delete adminUser2
  217 |     await page.fill('#username', 'admin')
  218 |     await page.fill('#password', 'admin123')
  219 |     await page.click('button[type="submit"]')
  220 |     await page.click('button:has-text("用户管理")')
  221 | 
  222 |     page.on('dialog', async (dialog) => {
  223 |       expect(dialog.message()).toContain(`确定要删除用户 "${adminUser2}" 吗？`)
  224 |       await dialog.accept()
  225 |     })
  226 | 
  227 |     const user2Row = page.locator(`tr:has-text("${adminUser2}")`)
  228 |     await user2Row.locator('button:has-text("删除")').click()
  229 |     
  230 |     // Verify User 2 is removed from table
  231 |     await expect(page.getByText(adminUser2)).not.toBeVisible()
  232 |   })
  233 | })
  234 | 
```