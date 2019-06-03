import React from 'react'
import { shallow } from 'enzyme'
import Welcome from './Welcome'

describe('<Welcome />', () => {
  test('renders a single <p> tag', () => {
    const wrapper = shallow(<Welcome />)
    expect(wrapper.find('p')).toHaveLength(1)
  })
})
