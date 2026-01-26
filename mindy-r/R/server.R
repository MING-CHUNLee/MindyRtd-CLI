#' Mindy Server Management
#'
#' Functions to start and stop the Mindy listener.
#' The listener watches for commands from the CLI and executes them in RStudio.
#'
#' @name server
NULL

# Package-level environment for storing state
.mindy_env <- new.env(parent = emptyenv())
.mindy_env$listener_running <- FALSE
.mindy_env$listener_interval <- 0.5
.mindy_env$start_time <- NULL

#' Start Mindy
#'
#' Starts the Mindy listener that watches for CLI commands.
#' This is the main entry point - just run mindy::start() in RStudio.
#'
#' @param interval Numeric. Polling interval in seconds. Default is 0.5.
#' @param quiet Logical. If TRUE, suppress startup messages.
#'
#' @return Invisibly returns TRUE.
#'
#' @examples
#' \dontrun{
#' # Start Mindy in RStudio
#' mindy::start()
#'
#' # Now in terminal:
#' # mindy run          <- runs current file
#' # mindy run "1+1"    <- runs code
#'
#' # Stop when done
#' mindy::stop()
#' }
#'
#' @export
start <- function(interval = 0.5, quiet = FALSE) {
    start_listener(interval = interval, quiet = quiet)
}

#' Stop Mindy
#'
#' Stops the Mindy listener.
#'
#' @param quiet Logical. If TRUE, suppress messages.
#'
#' @return Invisibly returns TRUE.
#'
#' @export
stop <- function(quiet = FALSE) {
    stop_listener(quiet = quiet)
}

#' Get Mindy Status
#'
#' Returns the current status of the Mindy listener.
#'
#' @return A list with status information.
#'
#' @export
status <- function() {
    running <- isTRUE(.mindy_env$listener_running)

    status <- list(
        running = running,
        start_time = if (running) .mindy_env$start_time else NA,
        uptime = if (running && !is.null(.mindy_env$start_time))
            as.numeric(difftime(Sys.time(), .mindy_env$start_time, units = "secs")) else NA,
        r_version = paste(R.version$major, R.version$minor, sep = "."),
        session_id = Sys.getpid(),
        commands_dir = get_mindy_dir()
    )

    class(status) <- c("mindy_status", "list")
    status
}

#' Print method for mindy_status
#'
#' @param x A mindy_status object
#' @param ... Additional arguments (ignored)
#'
#' @export
print.mindy_status <- function(x, ...) {
    cat("Mindy Status\n")
    cat("------------\n")
    cat("Listener:   ", if (x$running) "Running" else "Stopped", "\n")
    if (x$running) {
        cat("Uptime:     ", round(x$uptime, 1), " seconds\n")
    }
    cat("R Version:  ", x$r_version, "\n")
    cat("Session ID: ", x$session_id, "\n")
    cat("Commands:   ", x$commands_dir, "\n")
    invisible(x)
}

# Keep old names for backward compatibility
#' @rdname start
#' @export
start_server <- start

#' @rdname stop
#' @export
stop_server <- stop

#' @rdname status
#' @export
server_status <- status
