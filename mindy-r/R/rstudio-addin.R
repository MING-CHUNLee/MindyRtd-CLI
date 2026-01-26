#' RStudio Addins
#'
#' RStudio Addin functions for the Mindy package.
#'
#' @name addins
NULL

#' Start Mindy Server Addin
#'
#' RStudio Addin to start the Mindy API server.
#' This function is called when the user clicks the "Start Mindy Server" addin.
#'
#' @return Invisibly returns NULL.
start_server_addin <- function() {
    # Check if server is already running
    status <- server_status()

    if (status$running) {
        if (requireNamespace("rstudioapi", quietly = TRUE)) {
            rstudioapi::showDialog(
                title = "Mindy Server",
                message = paste0(
                    "Server is already running on port ", status$port, "\n\n",
                    "Uptime: ", round(status$uptime, 1), " seconds"
                )
            )
        } else {
            message("Mindy server is already running on port ", status$port)
        }
        return(invisible(NULL))
    }

    # Start the server
    tryCatch({
        start_server(background = TRUE, quiet = FALSE)

        if (requireNamespace("rstudioapi", quietly = TRUE)) {
            rstudioapi::showDialog(
                title = "Mindy Server Started",
                message = paste0(
                    "Mindy API server is now running!\n\n",
                    "URL: http://localhost:", .mindy_env$port, "\n\n",
                    "You can now use 'mindy run' from the terminal."
                )
            )
        }
    }, error = function(e) {
        if (requireNamespace("rstudioapi", quietly = TRUE)) {
            rstudioapi::showDialog(
                title = "Error",
                message = paste0("Failed to start server:\n\n", e$message)
            )
        } else {
            message("Failed to start server: ", e$message)
        }
    })

    invisible(NULL)
}

#' Stop Mindy Server Addin
#'
#' RStudio Addin to stop the Mindy API server.
#'
#' @return Invisibly returns NULL.
stop_server_addin <- function() {
    status <- server_status()

    if (!status$running) {
        if (requireNamespace("rstudioapi", quietly = TRUE)) {
            rstudioapi::showDialog(
                title = "Mindy Server",
                message = "No server is currently running."
            )
        } else {
            message("No Mindy server is running")
        }
        return(invisible(NULL))
    }

    stop_server(quiet = FALSE)

    if (requireNamespace("rstudioapi", quietly = TRUE)) {
        rstudioapi::showDialog(
            title = "Mindy Server Stopped",
            message = "The Mindy API server has been stopped."
        )
    }

    invisible(NULL)
}

#' Show Mindy Server Status Addin
#'
#' RStudio Addin to show the current server status.
#'
#' @return Invisibly returns NULL.
server_status_addin <- function() {
    status <- server_status()

    if (requireNamespace("rstudioapi", quietly = TRUE)) {
        if (status$running) {
            rstudioapi::showDialog(
                title = "Mindy Server Status",
                message = paste0(
                    "Status: Running\n",
                    "Port: ", status$port, "\n",
                    "Uptime: ", round(status$uptime, 1), " seconds\n",
                    "R Version: ", status$r_version, "\n",
                    "Session ID: ", status$session_id
                )
            )
        } else {
            rstudioapi::showDialog(
                title = "Mindy Server Status",
                message = "Status: Not Running\n\nClick 'Start Mindy Server' to start."
            )
        }
    } else {
        print(status)
    }

    invisible(NULL)
}
