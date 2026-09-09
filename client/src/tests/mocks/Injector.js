const Injector = {
  ready: (fn) => fn(),
  component: {
    register: () => {},
    registerMany: () => {},
  },
};

export default Injector;
export const loadComponent = (component) => component;
