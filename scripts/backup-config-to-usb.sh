#!/bin/sh
# backup-config-to-usb.sh — copy pfSense config.xml to a USB drive
# Runs ON pfSense (not the management host).
# Deploy via: make backup-usb-install

USB_DEV="${USB_DEV:-da0s1}"
MOUNT_POINT="/mnt/usb_backup"
BACKUP_DIR="${MOUNT_POINT}/pfsense-backups"
KEEP_LAST="${KEEP_LAST:-30}"

if [ ! -e "/dev/${USB_DEV}" ]; then
  echo "ERROR: /dev/${USB_DEV} not found" >&2
  echo "Available: $(ls /dev/da* /dev/mmcsd* 2>/dev/null | tr '\n' ' ')" >&2
  exit 1
fi

MOUNTED=0
if ! mount | grep -qF "/dev/${USB_DEV}"; then
  mkdir -p "${MOUNT_POINT}"
  mount_msdosfs "/dev/${USB_DEV}" "${MOUNT_POINT}" 2>/dev/null || \
    mount "/dev/${USB_DEV}" "${MOUNT_POINT}" || {
      echo "ERROR: failed to mount /dev/${USB_DEV} at ${MOUNT_POINT}" >&2
      exit 1
    }
  MOUNTED=1
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
DEST="${BACKUP_DIR}/config-${TIMESTAMP}.xml"
cp /cf/conf/config.xml "${DEST}" || { echo "ERROR: cp failed" >&2; exit 1; }

# Rotate: remove oldest beyond KEEP_LAST
ls -t "${BACKUP_DIR}"/config-*.xml 2>/dev/null | \
  tail -n +"$((KEEP_LAST + 1))" | xargs rm -f 2>/dev/null || true

COUNT=$(ls "${BACKUP_DIR}"/config-*.xml 2>/dev/null | wc -l | tr -d ' ')
echo "OK: ${DEST} (${COUNT} backups retained)"

if [ "${MOUNTED}" = "1" ]; then
  umount "${MOUNT_POINT}" 2>/dev/null || true
fi
