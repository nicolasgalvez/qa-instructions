## Sign in & check &lt;welcome>

> **Incomplete:** the test failed at step 5, so any later steps are missing.

Deploy the branch to dev first.

1. Open https://app.example.com/

   **Expected:** The **Home** heading is visible

   ![Step 1: Open https://app.example.com/](sign-in/step-01.png)

### Sign in

2. Click the **Sign in** link

   **Expected:** The page title is **Sign in**

   ![Step 2: Click the Sign in link](sign-in/step-02.png)

#### Enter the username

3. Type **demo-user** into **Username** _(approximate: the test forced this Action past its usual checks, so its highlight may not line up)_

   ![Step 3: Type demo-user into Username](sign-in/step-03.png)

### Sign in

4. **Warning:** The test changed the page with a script instead of a user action.

5. Click `Submit` &lt;b>now&lt;/b>

   **Expected:** **Welcome** is visible (**test failed here**)

   ![Step 5: Click Submit &lt;b>now&lt;/b>](sign-in/step-05.png)
