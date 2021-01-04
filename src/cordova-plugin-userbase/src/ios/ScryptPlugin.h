#import <Cordova/CDVPlugin.h>

@interface ScryptPlugin : CDVPlugin

- (void)scrypt:(CDVInvokedUrlCommand*)command;

@property (nonatomic, copy) NSString *callbackId;

@end

