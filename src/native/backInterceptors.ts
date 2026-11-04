/**
 * 安卓返回键的页面内拦截器栈。
 *
 * 弹窗、抽屉这类 UI 不是路由，返回键无从 history.back()。
 * 组件打开时注册拦截器，返回键优先交给它们；全部返回 false 才继续走
 * "切换底部 Tab / 回退一页 / 最小化" 的外层逻辑。
 *
 * 后注册的先执行：弹窗总比它所在的页面更靠近用户。
 */

type BackInterceptor = () => boolean;

const stack: BackInterceptor[] = [];

/** 注册拦截器，返回注销函数；注销可重复调用。 */
export function registerBackInterceptor(interceptor: BackInterceptor): () => void {
  stack.push(interceptor);
  return () => {
    const index = stack.lastIndexOf(interceptor);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** 倒序依次询问拦截器。返回 true 表示事件已被页面消费。 */
export function runBackInterceptors(): boolean {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]()) return true;
  }
  return false;
}
