LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)
LOCAL_MODULE := scrypt
LOCAL_SCRYPT_SRC := $(LOCAL_PATH)/../src/libscrypt
LOCAL_C_INCLUDES := $(LOCAL_SCRYPT_SRC)/

LOCAL_SRC_FILES := \
$(LOCAL_SCRYPT_SRC)/b64.c \
$(LOCAL_SCRYPT_SRC)/crypto_scrypt-hexconvert.c \
$(LOCAL_SCRYPT_SRC)/sha256.c \
$(LOCAL_SCRYPT_SRC)/crypto-mcf.c \
$(LOCAL_SCRYPT_SRC)/crypto_scrypt-nosse.c \
$(LOCAL_SCRYPT_SRC)/slowequals.c \
$(LOCAL_SCRYPT_SRC)/crypto_scrypt-check.c \
$(LOCAL_SCRYPT_SRC)/crypto-scrypt-saltgen.c \
$(LOCAL_SCRYPT_SRC)/crypto_scrypt-hash.c \
$(LOCAL_SCRYPT_SRC)/main.c

include $(BUILD_STATIC_LIBRARY)

include $(CLEAR_VARS)
LOCAL_MODULE := scrypt_crypho
LOCAL_STATIC_LIBRARIES := scrypt

LOCAL_SCRYPT_SRC := $(LOCAL_PATH)/../src/libscrypt
LOCAL_C_INCLUDES := $(LOCAL_SCRYPT_SRC)

LOCAL_CRYPHO_SRC := $(LOCAL_PATH)
LOCAL_SRC_FILES := $(LOCAL_PATH)/scrypt-jni.c

LOCAL_LDLIBS := -llog

include $(BUILD_SHARED_LIBRARY)