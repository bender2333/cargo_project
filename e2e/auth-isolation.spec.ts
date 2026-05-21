import { expect, test } from '@playwright/test'

test.describe('Auth Gating, User Isolation, and Admin Panel', () => {
  const testPassword = 'Password123!'

  test('redirects unauthenticated users to login page', async ({ page }) => {
    await page.goto('/')
    // Verify login page elements are shown
    await expect(page.getByText('货柜装箱计算系统')).toBeVisible()
    await expect(page.locator('#username')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
  })

  test('registers and logs in a new user', async ({ page }) => {
    const user = `u_reg_${Math.random().toString(36).substring(7)}`
    await page.goto('/')
    
    // Switch to Register page
    await page.click('text=没有账号？立即注册')
    await expect(page.getByText('创建新账号')).toBeVisible()

    // Fill in registration details
    await page.fill('#username', user)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')

    // After registration, we should be auto-logged in and see the workbench
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await expect(page.getByText(`用户:${user}`)).toBeVisible()
  })

  test('ensures strict data isolation for custom containers and history plans', async ({ page }) => {
    const user1 = `u1_iso_${Math.random().toString(36).substring(7)}`
    const user2 = `u2_iso_${Math.random().toString(36).substring(7)}`

    // 1. Log in as user1 and create custom container + history plan
    await page.goto('/')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user1)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Create a Custom Container for User 1
    await page.click('text=管理自定义柜型')
    await expect(page.getByText('自定义柜型管理')).toBeVisible()
    await page.click('text=+ 新增柜型')
    await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User1')
    await page.fill('label:has-text("长 mm") >> xpath=../input', '5100')
    await page.fill('label:has-text("宽 mm") >> xpath=../input', '2100')
    await page.fill('label:has-text("高 mm") >> xpath=../input', '2100')
    await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '11000')
    await page.click('button[type="submit"]:has-text("保存")')
    
    // Verify container is shown in the dialog
    await expect(page.getByText('Container-User1')).toBeVisible()
    // Select it
    await page.click('text=选用')
    
    // Save a History Plan for User 1
    await page.getByLabel('Shipment name').fill('Shipment-User1')
    await page.click('button:has-text("装箱")')
    await page.click('button:has-text("保存方案")')
    
    // Verify plan is in user1's history
    await page.click('button:has-text("历史")')
    await expect(page.getByText('Shipment-User1')).toBeVisible()
    
    // Log out User 1
    await page.click('text=退出')
    await expect(page.getByText('货柜装箱计算系统')).toBeVisible()

    // 2. Register and log in as User 2
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user2)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Open custom container presets dialog
    await page.click('text=管理自定义柜型')
    // Verify User 1's custom container is NOT visible (strict isolation!)
    await expect(page.getByText('Container-User1')).not.toBeVisible()

    // Create User 2's custom container
    await page.click('text=+ 新增柜型')
    await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User2')
    await page.fill('label:has-text("长 mm") >> xpath=../input', '6100')
    await page.fill('label:has-text("宽 mm") >> xpath=../input', '2200')
    await page.fill('label:has-text("高 mm") >> xpath=../input', '2200')
    await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '12000')
    await page.click('button[type="submit"]:has-text("保存")')
    await expect(page.getByText('Container-User2')).toBeVisible()
    await page.click('text=选用')

    // Go to History tab
    await page.click('button:has-text("历史")')
    // Verify User 1's shipment plan is NOT visible (strict isolation!)
    await expect(page.getByText('Shipment-User1')).not.toBeVisible()

    // Save a plan for User 2
    await page.click('button:has-text("工作台")')
    await page.getByLabel('Shipment name').fill('Shipment-User2')
    await page.click('button:has-text("装箱")')
    await page.click('button:has-text("保存方案")')
    await page.click('button:has-text("历史")')
    await expect(page.getByText('Shipment-User2')).toBeVisible()

    // Log out User 2
    await page.click('text=退出')
  })

  test('allows administrator to manage user accounts', async ({ page }) => {
    const adminUser1 = `u1_adm_${Math.random().toString(36).substring(7)}`
    const adminUser2 = `u2_adm_${Math.random().toString(36).substring(7)}`

    // Register two target users first so they exist in database
    await page.goto('/')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', adminUser1)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.click('text=退出')

    await page.click('text=没有账号？立即注册')
    await page.fill('#username', adminUser2)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.click('text=退出')

    // 1. Log in as seeded default administrator
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Open User Management panel
    await page.click('button:has-text("用户管理")')
    await expect(page.getByText('用户账号管理')).toBeVisible()
    await expect(page.getByText('管理员控制面板')).toBeVisible()

    // Verify adminUser1 and adminUser2 are listed
    await expect(page.getByText(adminUser1)).toBeVisible()
    await expect(page.getByText(adminUser2)).toBeVisible()

    // Verify we cannot toggle status or delete the master 'admin' account
    const adminRow = page.locator('tr:has-text("admin")')
    await expect(adminRow.locator('button:has-text("禁用")')).toHaveCount(0)
    await expect(adminRow.locator('button:has-text("删除")')).toHaveCount(0)

    // Disable adminUser1's account
    const user1Row = page.locator(`tr:has-text("${adminUser1}")`)
    await user1Row.locator('button:has-text("禁用")').click()
    await expect(user1Row.locator('text=已禁用')).toBeVisible()

    // Log out Admin
    await page.click('text=返回工作台')
    await page.click('text=退出')

    // 2. Try logging in with disabled adminUser1
    await page.fill('#username', adminUser1)
    await page.fill('#password', testPassword)
    await page.click('button[type="submit"]')
    // Should show error notification
    await expect(page.getByText(/账号已被禁用|Account has been disabled/)).toBeVisible()

    // 3. Log back as admin and delete adminUser2
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await page.click('button:has-text("用户管理")')

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`确定要删除用户 "${adminUser2}" 吗？`)
      await dialog.accept()
    })

    const user2Row = page.locator(`tr:has-text("${adminUser2}")`)
    await user2Row.locator('button:has-text("删除")').click()
    
    // Verify User 2 is removed from table
    await expect(page.getByText(adminUser2)).not.toBeVisible()
  })
})
