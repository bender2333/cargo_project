# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-isolation.spec.ts >> Auth Gating, User Isolation, and Admin Panel >> registers and logs in a new user
- Location: e2e\auth-isolation.spec.ts:15:3

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
  - text: u_reg_4fq3pf
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
  1   | import { expect, test } from '@playwright/test'
  2   | 
  3   | test.describe('Auth Gating, User Isolation, and Admin Panel', () => {
  4   |   const testPassword = 'Password123!'
  5   | 
  6   |   test('redirects unauthenticated users to login page', async ({ page }) => {
  7   |     await page.goto('/')
  8   |     // Verify login page elements are shown
  9   |     await expect(page.getByText('货柜装箱计算系统')).toBeVisible()
  10  |     await expect(page.locator('#username')).toBeVisible()
  11  |     await expect(page.locator('#password')).toBeVisible()
  12  |     await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
  13  |   })
  14  | 
  15  |   test('registers and logs in a new user', async ({ page }) => {
  16  |     const user = `u_reg_${Math.random().toString(36).substring(7)}`
  17  |     await page.goto('/')
  18  |     
  19  |     // Switch to Register page
  20  |     await page.click('text=没有账号？立即注册')
  21  |     await expect(page.getByText('创建新账号')).toBeVisible()
  22  | 
  23  |     // Fill in registration details
  24  |     await page.fill('#username', user)
  25  |     await page.fill('#password', testPassword)
  26  |     await page.fill('#confirmPassword', testPassword)
  27  |     await page.click('button[type="submit"]')
  28  | 
  29  |     // After registration, we should be auto-logged in and see the workbench
> 30  |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
      |                                               ^ Error: expect(locator).toBeVisible() failed
  31  |     await expect(page.getByText(`用户:${user}`)).toBeVisible()
  32  |   })
  33  | 
  34  |   test('ensures strict data isolation for custom containers and history plans', async ({ page }) => {
  35  |     const user1 = `u1_iso_${Math.random().toString(36).substring(7)}`
  36  |     const user2 = `u2_iso_${Math.random().toString(36).substring(7)}`
  37  | 
  38  |     // 1. Log in as user1 and create custom container + history plan
  39  |     await page.goto('/')
  40  |     await page.click('text=没有账号？立即注册')
  41  |     await page.fill('#username', user1)
  42  |     await page.fill('#password', testPassword)
  43  |     await page.fill('#confirmPassword', testPassword)
  44  |     await page.click('button[type="submit"]')
  45  |     await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  46  | 
  47  |     // Create a Custom Container for User 1
  48  |     await page.click('text=管理自定义柜型')
  49  |     await expect(page.getByText('自定义柜型管理')).toBeVisible()
  50  |     await page.click('text=+ 新增柜型')
  51  |     await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User1')
  52  |     await page.fill('label:has-text("长 mm") >> xpath=../input', '5100')
  53  |     await page.fill('label:has-text("宽 mm") >> xpath=../input', '2100')
  54  |     await page.fill('label:has-text("高 mm") >> xpath=../input', '2100')
  55  |     await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '11000')
  56  |     await page.click('button[type="submit"]:has-text("保存")')
  57  |     
  58  |     // Verify container is shown in the dialog
  59  |     await expect(page.getByText('Container-User1')).toBeVisible()
  60  |     // Select it
  61  |     await page.click('text=选用')
  62  |     
  63  |     // Save a History Plan for User 1
  64  |     await page.getByLabel('Shipment name').fill('Shipment-User1')
  65  |     await page.click('button:has-text("装箱")')
  66  |     await page.click('button:has-text("保存方案")')
  67  |     
  68  |     // Verify plan is in user1's history
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
```