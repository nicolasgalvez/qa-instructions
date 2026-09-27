## Sign in with bad credentials

1. Open http://127.0.0.1:4321/

   **Expected:** The **Fixture App** heading is visible

   ![Step 1: Open http://127.0.0.1:4321/](sign-in--sign-in-with-bad-credentials/step-01.png)

2. Click the **Sign in** link

   **Expected:** The page title is **Sign in**; **Username** is empty

   ![Step 2: Click the Sign in link](sign-in--sign-in-with-bad-credentials/step-02.png)

3. Type **demo-user** into **Username**

   ![Step 3: Type demo-user into Username](sign-in--sign-in-with-bad-credentials/step-03.png)

4. Click the **Submit bad credentials** button

   **Expected:** The page address contains **login-error**; **Invalid credentials** is visible; the **Login failed** heading is visible

   ![Step 4: Click the Submit bad credentials button](sign-in--sign-in-with-bad-credentials/step-04.png)

5. Press **Tab**

   ![Step 5: Press Tab](sign-in--sign-in-with-bad-credentials/step-05.png)
