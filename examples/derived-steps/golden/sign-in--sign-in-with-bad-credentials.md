## Sign in with bad credentials

1. Open http://127.0.0.1:4321/

   **Expected:** The **Fixture App** heading is visible

   ![Step 1: Open http://127.0.0.1:4321/](sign-in--sign-in-with-bad-credentials/step-01.png)

2. Click the **Sign in** link

   **Expected:** The page title is **Sign in**; **Username** is empty

   ![Step 2: Click the Sign in link](sign-in--sign-in-with-bad-credentials/step-02.png)

3. **Warning:** The test changed the page with a script instead of a user action. If the page does not match what comes next, you may need to do something by hand to continue.

   ![Step 3: The test changed the page with a script instead of a user action. If the page does not match what comes next, you may need to do something by hand to continue.](sign-in--sign-in-with-bad-credentials/step-03.png)

4. Type **demo-user** into **Username**

   ![Step 4: Type demo-user into Username](sign-in--sign-in-with-bad-credentials/step-04.png)

5. Click the **Submit bad credentials** button

   **Expected:** The page address contains **login-error**; **Invalid credentials** is visible; the **Login failed** heading is visible

   ![Step 5: Click the Submit bad credentials button](sign-in--sign-in-with-bad-credentials/step-05.png)

6. Press **Tab**

   ![Step 6: Press Tab](sign-in--sign-in-with-bad-credentials/step-06.png)
