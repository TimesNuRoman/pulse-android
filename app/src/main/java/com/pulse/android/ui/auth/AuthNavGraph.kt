/*
 * AuthNavGraph — internal nav graph for the 5-screen auth flow + 1 deep-link target.
 *
 * Mounted by MainActivity at the top of the app's NavHost when no session exists.
 * On successful login/signup the graph calls [onAuthed] which tells MainActivity
 * to swap the root to the main app graph.
 */
package com.pulse.android.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

object AuthRoutes {
    const val WELCOME = "auth/welcome"
    const val LOGIN = "auth/login"
    const val SIGNUP = "auth/signup"
    const val VERIFY = "auth/verify"
    const val FORGOT = "auth/forgot"
    const val RESET = "auth/reset"
    fun verify(email: String) = "$VERIFY?email=${java.net.URLEncoder.encode(email, "UTF-8")}"
    fun reset(token: String) = "$RESET?token=${java.net.URLEncoder.encode(token, "UTF-8")}"
}

@Composable
fun AuthNavGraph(
    onAuthed: () -> Unit,
    onForceWelcome: () -> Unit,
    navController: NavHostController = rememberNavController(),
    initialEmail: String? = null,
    initialToken: String? = null,
) {
    val start = when {
        initialToken != null -> AuthRoutes.reset(initialToken)
        initialEmail != null -> AuthRoutes.verify(initialEmail)
        else -> AuthRoutes.WELCOME
    }
    NavHost(
        navController = navController,
        startDestination = start,
    ) {
        composable(AuthRoutes.WELCOME) {
            WelcomeScreen(
                onCreateAccount = { navController.navigate(AuthRoutes.SIGNUP) },
                onLogin = { navController.navigate(AuthRoutes.LOGIN) },
            )
        }
        composable(AuthRoutes.LOGIN) {
            LoginScreen(
                onBack = { navController.popBackStack() },
                onSuccess = onAuthed,
                onCreateAccount = { navController.navigate(AuthRoutes.SIGNUP) },
                onForgot = { navController.navigate(AuthRoutes.FORGOT) },
            )
        }
        composable(AuthRoutes.SIGNUP) {
            SignupScreen(
                onBack = { navController.popBackStack() },
                onSuccess = { email -> navController.navigate(AuthRoutes.verify(email)) },
                onLogin = { navController.navigate(AuthRoutes.LOGIN) },
            )
        }
        composable(
            AuthRoutes.VERIFY + "?email={email}",
            arguments = listOf(navArgument("email") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            val email = java.net.URLDecoder.decode(entry.arguments?.getString("email").orEmpty(), "UTF-8")
            VerifyEmailScreen(
                email = email,
                onClose = onForceWelcome,
                onVerified = onAuthed,
            )
        }
        composable(AuthRoutes.FORGOT) {
            ForgotPasswordScreen(
                onBack = { navController.popBackStack() },
                onCreateAccount = { navController.navigate(AuthRoutes.SIGNUP) },
            )
        }
        composable(
            AuthRoutes.RESET + "?token={token}",
            arguments = listOf(navArgument("token") { type = NavType.StringType }),
        ) { entry ->
            val token = entry.arguments?.getString("token").orEmpty()
            ResetPasswordScreen(
                token = token,
                onBack = { navController.popBackStack() },
                onSuccess = onAuthed,
            )
        }
    }
}
