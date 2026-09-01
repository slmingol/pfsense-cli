<?php

/*
 * References:
 * https://gist.github.com/luckman212/5e69ecf04e000ace47eb8f760b71e160
 * https://forum.netgate.com/topic/137707/auto-update-check-checks-for-updates-to-base-system-packages-and-sends-email-alerts
 */

  require_once("pkg-utils.inc");
  require_once("notices.inc");
  require_once("util.inc");

  $msg = '';
  $pmsg = '';
  $p = 0;

  log_error("Starting update check");

  // pfSense base system check
  $system_version = get_system_pkg_version(false, false);
  if ($system_version === false) {
    printf("%s\n", 'Unable to check for updates');
    log_error("Unable to check for updates, exiting");
    exit;
  }

  if (!is_array($system_version) ||
    !isset($system_version['version']) ||
    !isset($system_version['installed_version'])) {
    printf("%s\n", 'Error in version information');
    log_error("Error in version information, exiting");
    exit;
  }

  switch ($system_version['pkg_version_compare']) {
    case '<':
      //printf("%s%s%s\n", "pfSense version ", $system_version['version'], " is available");
      $msg = "An update to pfSense version " . $system_version['version'] . " is available\n\n";
      break;
    case '=':
      //printf("%s%s%s\n", "pfSense version ", $system_version['version'], " (installed) is current");
      break;
    case '>':
      printf("pfSense version %s is NEWER than the latest available version %s\n", $system_version['installed_version'], $system_version['version']);
      $msg = "pfSense version " . $system_version['version'] . " is available (downgrade)\n\n";
      break;
    default:
      printf("%s\n", 'Error comparing installed with latest version available');
      log_error("Error comparing installed with latest version available");
      break;
  }

  // package check
  $package_list = get_pkg_info('all', true, true);
  $installed_packages = array_filter($package_list, function($v) {
    return (isset($v['installed']) && isset($v['name']));
  });

  if (!empty($installed_packages)) {
    foreach ($installed_packages as $pkg) {
      if (isset($pkg['installed_version']) && isset($pkg['version'])) {
        //printf("%s%s%s\n", $pkg['shortname'], ': ', $pkg['installed_version']);
        $version_compare = pkg_version_compare($pkg['installed_version'], $pkg['version']);
        if ($version_compare != '=') {
          $p++;
          $pmsg .= "\n".$pkg['shortname'].': '.$pkg['installed_version'].' ==> '.$pkg['version'];
          if ($version_compare == '>') {
            $pmsg .= ' (downgrade)';
          }
          printf("%s%s%s%s%s\n", $pkg['shortname'], ': ', $pkg['installed_version'], ' ==> ', $pkg['version']);
        }
      }
    }
    if ($p > 0) {
      $msg = $msg . "The following updates are available and can be installed using System > Package Manager or from the shell via pkg upgrade pfSense-pkg-{name}:\n" . $pmsg;
      printf("%s\n", 'to install these from the shell, use: pkg upgrade pfSense-pkg-{name}');
    }
  } else {
    printf("%s\n", 'No packages installed');
    log_error("No packages installed");
  }

  // check for updates to builtin packages
  exec("/usr/local/sbin/pkg-static upgrade -n | /usr/bin/sed -ne '/UPGRADED/,/^$/p'", $output, $retval);
  if (($retval == 0) && (count($output))) {
    $msg .= "\n\n" . "Some packages are part of the base system and will not show up in Package Manager. If any such updates are listed below, run `pkg upgrade` from the shell to install them:\n\n";
    array_shift($output);
    $msg .= implode("\n", array_map('ltrim', $output));
  }

  if (!empty($msg)) {
    log_error("Updates were found - sending notification(s)");
    // notify_via_smtp($msg);

    // to send alerts to ALL configured targets (email, Pushover, Slack etc) use the line below instead:
    // notify_all_remote($msg);

    // to send using ONLY a specific alternate method, uncomment the line(s) below
    // notify_via_pushover($msg);
    // notify_via_telegram($msg);
    notify_via_slack($msg);
  }

  log_error("Update check complete");

?>
